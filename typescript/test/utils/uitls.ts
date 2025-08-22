import HederaTestOps from './hedera-onchain-operations/HederaTestOps';
import { toDisplayUnit } from '@/shared/hedera-utils/decimals-utils';
import { expect } from 'vitest';
import BigNumber from 'bignumber.js';

export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to verify balance changes
// Note: HBAR has 8 decimal places
export async function verifyHbarBalanceChange(
  accountId: string,
  balanceBeforeRaw: BigNumber,
  expectedChange: number,
  hederaTestOps: HederaTestOps,
): Promise<void> {
  const balanceBefore = toDisplayUnit(balanceBeforeRaw, 8); // HBAR has 8 decimal places
  const balanceAfterRaw = await hederaTestOps.getAccountHbarBalance(accountId);
  const balanceAfter = toDisplayUnit(Number(balanceAfterRaw.toTinybars()), 8); // HBAR has 8 decimal places

  const expectedBalance = balanceBefore.plus(new BigNumber(expectedChange));

  console.log(
    `Verifying balance change for account ${accountId}. It was ${balanceBefore.toString()} HBAR before, should be ${expectedBalance.toString()} HBAR after. Fetched balance is ${balanceAfter.toString()} HBAR.`,
  );

  // Use BigNumber comparison with proper decimal precision (8 places for HBAR)
  expect(balanceAfter.decimalPlaces(8).isEqualTo(expectedBalance.decimalPlaces(8))).toBe(true);
}

export async function verifyHTSBalanceChange(
  accountId: string,
  balanceBeforeRaw: BigNumber,
  expectedChange: number,
  tokenDecimals: number,
  hederaTestOps: HederaTestOps,
): Promise<void> {
  const balanceBefore = toDisplayUnit(balanceBeforeRaw, tokenDecimals); // HBAR has 8 decimal places
  const balanceAfterRaw = await hederaTestOps.getAccountHbarBalance(accountId);
  const balanceAfter = toDisplayUnit(Number(balanceAfterRaw.toTinybars()), tokenDecimals); // HBAR has 8 decimal places

  // Use BigNumber arithmetic to avoid floating-point precision issues
  const expectedBalance = balanceBefore.plus(new BigNumber(expectedChange));

  console.log(
    `Verifying balance change for account ${accountId}. It was ${balanceBefore.toString()} HBAR before, should be ${expectedBalance.toString()} HBAR after. Fetched balance is ${balanceAfter.toString()} HBAR.`,
  );

  // Use BigNumber comparison with proper decimal precision (8 places for HBAR)
  expect(balanceAfter.decimalPlaces(8).isEqualTo(expectedBalance.decimalPlaces(8))).toBe(true);
}
