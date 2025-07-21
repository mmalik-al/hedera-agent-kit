import { beforeAll, describe, expect, it } from "vitest";
import { HederaConversationalAgent, ServerSigner } from "../../src";
import { HederaNetworkPlugin } from "../../src/plugins/core";
import { Block } from "../../src/services";

describe("Hedera Network Plugin Tests", () => {
  let agent: HederaConversationalAgent;
  let signer: ServerSigner;

  beforeAll(async () => {
    const accountId = process.env.HEDERA_ACCOUNT_ID;
    const privateKey = process.env.HEDERA_PRIVATE_KEY;
    const openAIApiKey = process.env.OPENAI_API_KEY;

    if (!accountId || !privateKey || !openAIApiKey) {
      throw new Error(
        'HEDERA_ACCOUNT_ID, HEDERA_PRIVATE_KEY, and OPENAI_API_KEY must be set in environment variables.'
      );
    }

    signer = new ServerSigner(accountId, privateKey, 'testnet');
    agent = new HederaConversationalAgent(signer, {
      pluginConfig: { plugins: [new HederaNetworkPlugin()] },
      userAccountId: accountId,
      openAIApiKey,
      verbose: true,
      scheduleUserTransactionsInBytesMode: false,
      operationalMode: 'autonomous'
    });
    await agent.initialize();

  })

  describe('HederaGetHbarPriceTool', () => {
    it('should query the HBAR price correctly', async () => {
      const prompt = 'What is the current HBAR price?';
      const response = await agent.processMessage(prompt);
      console.log(`response of tool: ${JSON.stringify(response, null, 2)}`);

      expect(response.error).toBeUndefined();
      expect(response.success!).toEqual(true);
      expect(response.priceUsd!).toBeDefined();
      expect(response.priceUsd!).toBeGreaterThan(0)
    });

    it('should query the HBAR price correctly for a specific date', async () => {
      const date = '2025-01-01T00:00:00.000Z';
      const response = await agent.processMessage(`What was the HBAR price on ${date}?`);

      expect(response.error).toBeUndefined();
      expect(response.success).toEqual(true);
      expect(response.priceUsd).toBeDefined();
      expect(response.priceUsd).toBeGreaterThan(0);
      expect(response.date).toBe(date);
    });


  })

  describe('HederaGetBlocksTool', async () => {
    it('should query the blocks correctly', async () => {
      const prompt = 'Get the latest 3 blocks from the Hedera network.';
      const response = await agent.processMessage(prompt);
      console.log(`response of blocks tool: ${JSON.stringify(response, null, 2)}`);

      const blocks = response.blocks! as Block[];
      expect(response.error).toBeUndefined();
      expect(response.success).toEqual(true);
      expect(response.blocks).toBeDefined();
      expect(Array.isArray(response.blocks)).toBe(true);
      expect(blocks.length).toEqual(3);
    });

    it('should query a specific block by block number', async () => {
      const prompt = 'Get block number 21791163';
      const response = await agent.processMessage(prompt);

      const blocks = response.blocks as Block[];

      expect(response.error).toBeUndefined();
      expect(response.success).toEqual(true);
      expect(blocks).toHaveLength(1);
      expect(blocks[0].number).toBe(21791163);
    });

    it('should respect the limit parameter when querying blocks', async () => {
      const prompt = 'Get the latest 2 blocks from the Hedera network.';
      const response = await agent.processMessage(prompt);

      const blocks = response.blocks as Block[];

      expect(response.error).toBeUndefined();
      expect(response.success).toEqual(true);
      expect(blocks.length).toBeLessThanOrEqual(2);
    });

    it('should return blocks in ascending order when specified', async () => {
      const prompt = 'Get 3 blocks in ascending order.';
      const response = await agent.processMessage(prompt);

      const blocks = response.blocks as Block[];

      expect(response.success).toEqual(true);
      expect(blocks.length).toBeGreaterThan(0);

      for (let i = 1; i < blocks.length; i++) {
        expect(blocks[i].number).toBeGreaterThanOrEqual(blocks[i - 1].number);
      }
    });

    it('should return blocks in descending order when specified', async () => {
      const prompt = 'Get 3 blocks in descending order.';
      const response = await agent.processMessage(prompt);

      const blocks = response.blocks as Block[];

      expect(response.success).toEqual(true);
      expect(blocks.length).toBeGreaterThan(0);

      for (let i = 1; i < blocks.length; i++) {
        expect(blocks[i].number).toBeLessThanOrEqual(blocks[i - 1].number);
      }
    });
  })

  describe('HederaGetNetworkInfoTool', () => {
    // TODO: HederaGetNetworkInfoTool should be fixed before implementing the tests
  });

  describe('HederaGetNetworkFeesTool', () => {
    // TODO: HederaGetNetworkFeesTool should be fixed before implementing the tests
  });
})