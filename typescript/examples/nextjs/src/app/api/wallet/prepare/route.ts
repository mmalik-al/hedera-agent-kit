import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAgentBootstrap, createToolkitConfiguration, createHederaClient } from '@/lib/agent';
import { HederaLangchainToolkit } from 'hedera-agent-kit';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { AgentExecutor, createToolCallingAgent } from 'langchain/agents';

export const runtime = 'nodejs';

const PrepareSchema = z.object({
    input: z.string().min(1),
    accountId: z.string().optional(),
});

export async function POST(req: NextRequest) {
    try {
        const bootstrap = createAgentBootstrap();
        if (bootstrap.mode !== 'human') {
            return NextResponse.json(
                { error: 'This endpoint is only for RETURN_BYTES (HITL) mode' },
                { status: 400 },
            );
        }

        const body = await req.json();
        const { input, accountId } = PrepareSchema.parse(body);

        const configuration = {
            ...createToolkitConfiguration(bootstrap),
            context: {
                ...bootstrap.context,
                accountId: accountId,
            },
        };
        const client = createHederaClient(bootstrap);
        const hederaToolkit = new HederaLangchainToolkit({ client, configuration });
        const tools = hederaToolkit.getTools();

        const chatPrompt = ChatPromptTemplate.fromMessages([
            ['system', 'You are a helpful assistant that returns Hedera transaction bytes for signing.'],
            ['human', '{input}'],
            ['placeholder', '{agent_scratchpad}'],
        ]);
        const agent = createToolCallingAgent({ llm: undefined as unknown as never, tools, prompt: chatPrompt });
        const executor = new AgentExecutor({ agent, tools, returnIntermediateSteps: true });
        const response = await executor.invoke({ input });
        return NextResponse.json({ ok: true, mode: bootstrap.mode, result: response });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return NextResponse.json({ ok: false, error: message }, { status: 400 });
    }
}


