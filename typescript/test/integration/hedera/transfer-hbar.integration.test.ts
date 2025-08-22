import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client, PrivateKey, AccountId } from '@hashgraph/sdk';
import { z } from 'zod';
import transferHbarTool from '@/plugins/core-account-plugin/tools/account/transfer-hbar';
import { transferHbarParameters } from '@/shared/parameter-schemas/has.zod';
import { Context, AgentMode } from '@/shared/configuration';
import HederaTestOps from '../../utils/hedera-onchain-operations/HederaTestOps';
import { verifyHbarBalanceChange, wait } from '../../utils/uitls';

describe('Transfer HBAR Integration Tests', () => {
  let client: Client;
  let context: Context;
  let operatorAccountId: AccountId;
  let recipientAccountId: string;
  let recipientAccountId2: string;
  let hederaTestOps: HederaTestOps;

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
    hederaTestOps = new HederaTestOps(client);

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
      const balanceBefore = await hederaTestOps.getAccountHbarBalance(recipientAccountId);
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
      await verifyHbarBalanceChange(
        recipientAccountId,
        balanceBefore.toBigNumber(),
        amountToTransfer,
        hederaTestOps,
      );
    });

    it('should successfully transfer HBAR to multiple recipients', async () => {
      const balanceBefore1 = await hederaTestOps.getAccountHbarBalance(recipientAccountId);
      const balanceBefore2 = await hederaTestOps.getAccountHbarBalance(recipientAccountId2);

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
      await verifyHbarBalanceChange(recipientAccountId, balanceBefore1.toBigNumber(), 0.05, hederaTestOps);
      await verifyHbarBalanceChange(recipientAccountId2, balanceBefore2.toBigNumber(), 0.05, hederaTestOps);
    });

    it('should successfully transfer with explicit source account', async () => {
      const balanceBefore = await hederaTestOps.getAccountHbarBalance(recipientAccountId);

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
      await verifyHbarBalanceChange(recipientAccountId, balanceBefore.toBigNumber(), 0.1, hederaTestOps);
    });

    it('should successfully transfer without memo', async () => {
      const balanceBefore = await hederaTestOps.getAccountHbarBalance(recipientAccountId);

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
      await verifyHbarBalanceChange(recipientAccountId, balanceBefore.toBigNumber(), 0.05, hederaTestOps);
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
      const balanceBefore = await hederaTestOps.getAccountHbarBalance(recipientAccountId);
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
      await verifyHbarBalanceChange(
        recipientAccountId,
        balanceBefore.toBigNumber(),
        amountToTransfer,
        hederaTestOps,
      );
    });

    it('should handle long memo strings', async () => {
      const balanceBefore = await hederaTestOps.getAccountHbarBalance(recipientAccountId);
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
      await verifyHbarBalanceChange(
        recipientAccountId,
        balanceBefore.toBigNumber(),
        amountToTransfer,
        hederaTestOps,
      );
    });

    it('should handle maximum number of transfers in a single transaction', async () => {
      const balanceBefore = await hederaTestOps.getAccountHbarBalance(recipientAccountId);
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
      await verifyHbarBalanceChange(recipientAccountId, balanceBefore.toBigNumber(), totalAmount, hederaTestOps);
    });
  });
});
