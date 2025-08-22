import { Client, PrivateKey, AccountId } from '@hashgraph/sdk';
import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { HederaLangchainToolkit } from '@/langchain';
import { AgentMode } from '@/shared';
import type { Plugin } from '@/shared/plugin';
import { expect } from 'vitest';

export interface LangchainTestSetup {
  client: Client;
  agentExecutor: AgentExecutor;
  toolkit: HederaLangchainToolkit;
  cleanup: () => void;
}

export interface LangchainTestOptions {
  tools: string[];
  plugins: Plugin[];
  systemPrompt?: string;
  temperature?: number;
  maxIterations?: number;
  model?: string;
}

export async function createLangchainTestSetup(options: LangchainTestOptions): Promise<LangchainTestSetup> {
  // Initialize Hedera client
  const operatorId = process.env.ACCOUNT_ID;
  const operatorKey = process.env.PRIVATE_KEY;

  if (!operatorId || !operatorKey) {
    throw new Error('ACCOUNT_ID and PRIVATE_KEY must be set.');
  }

  const operatorAccountId = AccountId.fromString(operatorId);
  const privateKey = PrivateKey.fromStringDer(operatorKey);
  const client = Client.forTestnet().setOperator(operatorAccountId, privateKey);

  // Initialize OpenAI LLM
  const llm = new ChatOpenAI({
    model: options.model || 'gpt-4o-mini',
    temperature: options.temperature ?? 0, // Make responses more deterministic for testing
  });

  // Prepare Hedera toolkit with specified tools and plugins
  const toolkit = new HederaLangchainToolkit({
    client,
    configuration: {
      tools: options.tools,
      plugins: options.plugins,
      context: {
        mode: AgentMode.RETURN_BYTES, // Use RETURN_BYTES to prevent actual execution
        accountId: operatorAccountId.toString(),
      },
    },
  });

  // Create a prompt template for tool calling
  const systemPrompt = options.systemPrompt || `You are a Hedera blockchain assistant. You have access to tools for blockchain operations.
When a user requests blockchain operations, use the appropriate tools with the correct parameters.
Extract all necessary parameters from the user's request.
Always use the exact tool name and parameter structure expected.`;

  const prompt = ChatPromptTemplate.fromMessages([
    ['system', systemPrompt],
    ['human', '{input}'],
    ['placeholder', '{agent_scratchpad}'],
  ]);

  // Get tools from a toolkit
  const tools = toolkit.getTools();

  // Create the agent
  const agent = createToolCallingAgent({
    llm,
    tools,
    prompt,
  });

  // Create an agent executor
  const agentExecutor = new AgentExecutor({
    agent,
    tools,
    returnIntermediateSteps: true, // This allows us to see the tool calls
    maxIterations: options.maxIterations ?? 1, // Stop after the first tool call to avoid execution by default
  });

  const cleanup = () => {
    if (client) {
      client.close();
    }
  };

  return {
    client,
    agentExecutor,
    toolkit,
    cleanup,
  };
}

export function getToolCallFromResult(result: any, stepIndex: number = 0): any {
  if (!result.intermediateSteps || result.intermediateSteps.length === 0) {
    throw new Error('No intermediate steps found in result. Make sure returnIntermediateSteps is enabled.');
  }

  if (stepIndex >= result.intermediateSteps.length) {
    throw new Error(`Step index ${stepIndex} is out of bounds. Only ${result.intermediateSteps.length} steps available.`);
  }

  return result.intermediateSteps[stepIndex];
}

export function expectToolCall(toolCall: any, expectedTool: string, expectedInputValidator?: (input: any) => void): void {
  expect(toolCall).toBeDefined();
  expect(toolCall.action).toBeDefined();
  expect(toolCall.action.tool).toBe(expectedTool);
  expect(toolCall.action.toolInput).toBeDefined();

  if (expectedInputValidator) {
    expectedInputValidator(toolCall.action.toolInput);
  }
}
