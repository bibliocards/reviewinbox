# AI provider strategy

ReviewInbox cloud includes managed AI by default, while self-hosted deployments use bring-your-own-key or local OpenAI-compatible providers such as Ollama. The V1 implementation uses Vercel AI SDK behind a ReviewInbox-owned `packages/ai` boundary, while domain code remains independent of provider SDKs.

## Considered Options

- Native provider SDKs were rejected for V1 because ReviewInbox needs a consistent interface across OpenAI, Anthropic, and OpenAI-compatible providers.
- LangChain was rejected because the V1 tasks are structured generation and summarization, not complex chains.
- Better Agent was rejected for V1 because ReviewInbox does not yet need durable agent runs, tool orchestration, memory, or agentic approval flows.

## Consequences

Prompts and output schemas should be versioned. Better Agent or a similar framework can be reconsidered later if ReviewInbox adds agentic workflows such as creating tickets, linking issues, or coordinating multi-step support actions after human approval.
