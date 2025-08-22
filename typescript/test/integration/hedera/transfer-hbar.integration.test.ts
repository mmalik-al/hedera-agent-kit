import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client, PrivateKey, AccountId, LedgerId } from '@hashgraph/sdk';
import { z } from 'zod';
import BigNumber from 'bignumber.js';
import transferHbarTool from '@/plugins/core-account-plugin/tools/account/transfer-hbar';
import { transferHbarParameters } from '@/shared/parameter-schemas/has.zod';
import { Context, AgentMode } from '@/shared/configuration';
import HederaTestOps from '../../utils/hedera-onchain-operations/HederaTestOps';
import {
  HederaMirrornodeServiceDefaultImpl
} from '@/shared/hedera-utils/mirrornode/hedera-mirrornode-service-default-impl';
import { IHederaMirrornodeService } from '@/shared/hedera-utils/mirrornode/hedera-mirrornode-service.interface';
import { wait } from '../../utils/uitls';
import { toDisplayUnit } from '@/shared/hedera-utils/decimals-utils';

// Helper function to verify balance changes
// Note: HBAR has 8 decimal places
async function verifyBalanceChange(
  accountId: string,
  balanceBeforeRaw: BigNumber,
  expectedChange: number,
  mirrorNodeService: IHederaMirrornodeService
): Promise<void> {
  // Convert raw balance to display units (HBAR with 8 decimals) using BigNumber
  const balanceBefore = toDisplayUnit(balanceBeforeRaw, 8);
  const balanceAfterRaw = await mirrorNodeService.getAccountHBarBalance(accountId);
  const balanceAfter = toDisplayUnit(balanceAfterRaw, 8);

  // Use BigNumber arithmetic to avoid floating-point precision issues
  const expectedBalance = balanceBefore.plus(new BigNumber(expectedChange));

  console.log(`Verifying balance change for account ${accountId}. It was ${balanceBefore.toString()} HBAR before, should be ${expectedBalance.toString()} HBAR after. Fetched balance is ${balanceAfter.toString()} HBAR.`);

  // Use BigNumber comparison with proper decimal precision (8 places for HBAR)
  expect(balanceAfter.decimalPlaces(8).isEqualTo(expectedBalance.decimalPlaces(8))).toBe(true);
}

describe('Transfer HBAR Integration Tests', () => {
  let client: Client;
  let context: Context;
  let operatorAccountId: AccountId;
  let recipientAccountId: string;
  let recipientAccountId2: string;
  let mirrorNodeService: IHederaMirrornodeService;

  beforeAll(async () => {
    // Initialize Hedera client using the same pattern as examples
    const operatorId = process.env.ACCOUNT_ID;
    const operatorKey = process.env.PRIVATE_KEY;

    if (!operatorId || !operatorKey) {
      throw new Error('ACCOUNT_ID and PRIVATE_KEY must be set.');
    }

    operatorAccountId = AccountId.fromString(operatorId);
    const privateKey = PrivateKey.fromStringDer(operatorKey); // TODO: support other key formats

    client = Client.forTestnet().setOperator(operatorAccountId, privateKey);
    mirrorNodeService = new HederaMirrornodeServiceDefaultImpl(LedgerId.TESTNET); // hardcoded testnet

    const hederaTestOps = new HederaTestOps(client);

    recipientAccountId = await hederaTestOps
      .createAccount({ publicKey: client.operatorPublicKey!.toStringDer() })
      .then(accountId => accountId.toString());

    recipientAccountId2 = await hederaTestOps
      .createAccount({ publicKey: client.operatorPublicKey!.toStringDer() })
      .then(accountId => accountId.toString());

    await wait(3000);

    context = {
      mode: AgentMode.AUTONOMOUS,
      accountId: operatorAccountId.toString(),
    };
  });

  afterAll(async () => {
    if (client) {
      client.close();
    }
  });

  describe('Valid Transfer Scenarios', () => {
    it('should successfully transfer HBAR to a single recipient', async () => {
      const balanceBefore = await mirrorNodeService.getAccountHBarBalance(recipientAccountId);
      const amountToTransfer = 0.1; // 0.1 HBAR

      const params: z.infer<ReturnType<typeof transferHbarParameters>> = {
        transfers: [
          {
            accountId: recipientAccountId,
            amount: amountToTransfer,
          },
        ],
        transactionMemo: 'Integration test transfer',
      };

      const tool = transferHbarTool(context);
      const result = await tool.execute(client, context, params);

      // Check that the result contains a transaction ID
      expect(result.humanMessage).toContain('HBAR successfully transferred');
      expect(result.humanMessage).toContain('Transaction ID:');
      expect(result.raw.status).toBe(22);
      expect(result.raw.transactionId).toBeDefined();

      // Verify balance change using the helper function
      await wait(3000); // wait for balance changes to be reflected in mirrornode
      await verifyBalanceChange(recipientAccountId, balanceBefore, amountToTransfer, mirrorNodeService);
    });

    it('should successfully transfer HBAR to multiple recipients', async () => {
      const balanceBefore1 = await mirrorNodeService.getAccountHBarBalance(recipientAccountId);
      const balanceBefore2 = await mirrorNodeService.getAccountHBarBalance(recipientAccountId2);

      const params: z.infer<ReturnType<typeof transferHbarParameters>> = {
        transfers: [
          {
            accountId: recipientAccountId,
            amount: 0.05,
          },
          {
            accountId: recipientAccountId2,
            amount: 0.05,
          },
        ],
        transactionMemo: 'Multi-recipient test transfer',
      };

      const tool = transferHbarTool(context);
      const result = await tool.execute(client, context, params);

      expect(result.humanMessage).toContain('HBAR successfully transferred');
      expect(result.humanMessage).toContain('Transaction ID:');
      expect(result.raw.status).toBe(22);
      expect(result.raw.transactionId).toBeDefined();

      // Verify balance changes for both recipients
      await wait(3000); // wait for balance changes to be reflected in mirrornode
      await verifyBalanceChange(recipientAccountId, balanceBefore1, 0.05, mirrorNodeService);
      await verifyBalanceChange(recipientAccountId2, balanceBefore2, 0.05, mirrorNodeService);
    });

    it('should successfully transfer with explicit source account', async () => {
      const balanceBefore = await mirrorNodeService.getAccountHBarBalance(recipientAccountId);

      const params: z.infer<ReturnType<typeof transferHbarParameters>> = {
        transfers: [
          {
            accountId: recipientAccountId,
            amount: 0.1,
          },
        ],
        sourceAccountId: operatorAccountId.toString(),
        transactionMemo: 'Explicit source account test',
      };

      const tool = transferHbarTool(context);
      const result = await tool.execute(client, context, params);

      expect(result.humanMessage).toContain('HBAR successfully transferred');
      expect(result.humanMessage).toContain('Transaction ID:');
      expect(result.raw.status).toBe(22);
      expect(result.raw.transactionId).toBeDefined();

      // Verify balance change
      await wait(3000); // wait for balance changes to be reflected in mirrornode
      await verifyBalanceChange(recipientAccountId, balanceBefore, 0.1, mirrorNodeService);
    });

    it('should successfully transfer without memo', async () => {
      const balanceBefore = await mirrorNodeService.getAccountHBarBalance(recipientAccountId);

      const params: z.infer<ReturnType<typeof transferHbarParameters>> = {
        transfers: [
          {
            accountId: recipientAccountId,
            amount: 0.05,
          },
        ],
      };

      const tool = transferHbarTool(context);
      const result = await tool.execute(client, context, params);

      expect(result.humanMessage).toContain('HBAR successfully transferred');
      expect(result.humanMessage).toContain('Transaction ID:');
      expect(result.raw.status).toBe(22);
      expect(result.raw.transactionId).toBeDefined();

      // Verify balance change
      await wait(3000); // wait for balance changes to be reflected in mirrornode
      await verifyBalanceChange(recipientAccountId, balanceBefore, 0.05, mirrorNodeService);
    });
  });

  describe('Invalid Transfer Scenarios', () => {
    it('should fail with zero amount transfer', async () => {
      const params: z.infer<ReturnType<typeof transferHbarParameters>> = {
        transfers: [
          {
            accountId: recipientAccountId,
            amount: 0,
          },
        ],
      };

      const tool = transferHbarTool(context);
      const result = await tool.execute(client, context, params);

      // Should return an object with humanMessage and raw
      expect(result.raw.status).not.toBe(22); // no success code
      expect(result.humanMessage).toContain('Invalid transfer amount');
    });

    it('should fail with negative amount transfer', async () => {
      const params: z.infer<ReturnType<typeof transferHbarParameters>> = {
        transfers: [
          {
            accountId: recipientAccountId,
            amount: -0.1,
          },
        ],
      };

      const tool = transferHbarTool(context);
      const result = await tool.execute(client, context, params);

      // Should return an object with humanMessage and raw
      expect(result.raw.status).not.toBe(22); // no success code
      expect(result.humanMessage).toContain('Invalid transfer amount');
    });

    it('should fail with invalid recipient account ID', async () => {
      const params: z.infer<ReturnType<typeof transferHbarParameters>> = {
        transfers: [
          {
            accountId: 'invalid.account.id',
            amount: 0.1,
          },
        ],
      };

      const tool = transferHbarTool(context);
      const result = await tool.execute(client, context, params);

      // Should return an object with humanMessage and raw
      expect(result.raw.status).not.toBe(22); // no success code
      expect(result.humanMessage).not.toContain('HBAR successfully transferred');
    });

    it('should fail with insufficient balance (large amount)', async () => {
      const params: z.infer<ReturnType<typeof transferHbarParameters>> = {
        transfers: [
          {
            accountId: recipientAccountId,
            amount: 1000000, // 1 million HBAR - likely more than test account has
          },
        ],
      };

      const tool = transferHbarTool(context);
      const result = await tool.execute(client, context, params);

      // Should return an object with humanMessage and raw
      expect(result.raw.status).not.toBe(22); //no success code
      expect(result.humanMessage).not.toContain('HBAR successfully transferred');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small amounts (1 tinybar equivalent)', async () => {
      const balanceBefore = await mirrorNodeService.getAccountHBarBalance(recipientAccountId);
      const amountToTransfer = 0.00000001; // 1 tinybar

      const params: z.infer<ReturnType<typeof transferHbarParameters>> = {
        transfers: [
          {
            accountId: recipientAccountId,
            amount: amountToTransfer,
          },
        ],
        transactionMemo: 'Minimal amount test',
      };

      const tool = transferHbarTool(context);
      const result = await tool.execute(client, context, params);

      expect(result.humanMessage).toContain('HBAR successfully transferred');
      expect(result.humanMessage).toContain('Transaction ID:');
      expect(result.raw.status).toBe(22);
      expect(result.raw.transactionId).toBeDefined();

      // Verify balance change
      await wait(3000); // wait for balance changes to be reflected in mirrornode
      await verifyBalanceChange(recipientAccountId, balanceBefore, amountToTransfer, mirrorNodeService);
    });

    it('should handle long memo strings', async () => {
      const balanceBefore = await mirrorNodeService.getAccountHBarBalance(recipientAccountId);
      const longMemo = 'A'.repeat(90); // Close to 100 char limit for memos
      const amountToTransfer = 0.01;

      const params: z.infer<ReturnType<typeof transferHbarParameters>> = {
        transfers: [
          {
            accountId: recipientAccountId,
            amount: amountToTransfer,
          },
        ],
        transactionMemo: longMemo,
      };

      const tool = transferHbarTool(context);
      const result = await tool.execute(client, context, params);

      expect(result.humanMessage).toContain('HBAR successfully transferred');
      expect(result.humanMessage).toContain('Transaction ID:');
      expect(result.raw.status).toBe(22);
      expect(result.raw.transactionId).toBeDefined();

      // Verify balance change
      await wait(3000); // wait for balance changes to be reflected in mirrornode
      await verifyBalanceChange(recipientAccountId, balanceBefore, amountToTransfer, mirrorNodeService);
    });

    it('should handle maximum number of transfers in a single transaction', async () => {
      const balanceBefore = await mirrorNodeService.getAccountHBarBalance(recipientAccountId);
      const transferAmount = 0.001;
      const transferCount = 10;
      const totalAmount = transferAmount * transferCount;

      // Create multiple small transfers
      const transfers = Array(transferCount)
        .fill(null)
        .map((_, _index) => ({
          accountId: recipientAccountId,
          amount: transferAmount,
        }));

      const params: z.infer<ReturnType<typeof transferHbarParameters>> = {
        transfers,
        transactionMemo: 'Multiple transfers test',
      };

      const tool = transferHbarTool(context);
      const result = await tool.execute(client, context, params);

      expect(result.humanMessage).toContain('HBAR successfully transferred');
      expect(result.humanMessage).toContain('Transaction ID:');
      expect(result.raw.status).toBe(22);
      expect(result.raw.transactionId).toBeDefined();

      // Verify total balance change
      await wait(3000); // wait for balance changes to be reflected in mirrornode
      await verifyBalanceChange(recipientAccountId, balanceBefore, totalAmount, mirrorNodeService);
    });
  });
});
