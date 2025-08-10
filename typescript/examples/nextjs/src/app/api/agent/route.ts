import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { HederaLangchainToolkit } from 'hedera-agent-kit';
import { createAgentBootstrap, createHederaClient, createToolkitConfiguration } from '@/lib/agent';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';
import { BufferMemory } from 'langchain/memory';
import { ChatOpenAI } from '@langchain/openai';

export const runtime = 'nodejs';

const RequestSchema = z.object({
    input: z.string().min(1),
});

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { input } = RequestSchema.parse(body);

        const bootstrap = createAgentBootstrap();
        const client = createHederaClient(bootstrap);
        const configuration = createToolkitConfiguration(bootstrap);

        const hederaToolkit = new HederaLangchainToolkit({ client, configuration });
        const tools = hederaToolkit.getTools();

        const chatPrompt = ChatPromptTemplate.fromMessages([
            ['system', 'You are a helpful assistant that uses Hedera tools.'],
            ['placeholder', '{chat_history}'],
            ['human', '{input}'],
            ['placeholder', '{agent_scratchpad}'],
        ]);
        const llmApiKey = process.env.OPENAI_API_KEY;
        if (!llmApiKey) {
            return NextResponse.json({ ok: false, error: 'OPENAI_API_KEY is required' }, { status: 400 });
        }
        const llm = new ChatOpenAI({ model: 'gpt-4o-mini' });
        const executor = new AgentExecutor({
            agent: createToolCallingAgent({ llm, tools, prompt: chatPrompt }),
            tools,
            memory: new BufferMemory({ memoryKey: 'chat_history', returnMessages: true }),
            returnIntermediateSteps: false,
        });

        const response = await executor.invoke({ input });
        return NextResponse.json({ ok: true, mode: bootstrap.mode, network: bootstrap.network, result: response });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
}


