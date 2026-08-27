export const name = 'patent-intelligence'
export const inject = ['tools']

const actions = [
  'strategy', 'import', 'search_ops', 'workset',
  'annotate', 'analyze', 'report', 'status'
]

export function apply(ctx) {
  ctx.tools.register({
    name: 'patent_intel',
    description: 'Global patent intelligence workflow. Convert the user request into multilingual concepts before action=strategy. Use one action at a time: strategy builds search strategy and database-specific queries; import loads CSV/XLSX/JSON exports into SQLite; search_ops retrieves EPO OPS bibliographic data when credentials exist; workset returns compact records for LLM technical classification/route extraction; annotate writes LLM annotations; analyze deduplicates and merges patent families and scores core patents; report exports sqlite/json/markdown/excel/html; status inspects a workspace.',
    parameters: {
      type: 'object',
      additionalProperties: true,
      required: ['action'],
      properties: {
        action: { type: 'string', enum: actions },
        workspace: { type: 'string', description: 'Workspace directory. Defaults to ./patent-workspace.' },
        topic: { type: 'string' },
        concepts: {
          type: 'array',
          description: 'Concept blocks prepared by the agent, e.g. [{name:"target",terms:["resveratrol","白藜芦醇"]}]',
          items: { type: 'object', additionalProperties: true }
        },
        jurisdictions: { type: 'array', items: { type: 'string' } },
        databases: { type: 'array', items: { type: 'string' } },
        file: { type: 'string' },
        query: { type: 'string' },
        limit: { type: 'number' },
        offset: { type: 'number' },
        annotations: { type: 'array', items: { type: 'object', additionalProperties: true } },
        formats: { type: 'array', items: { type: 'string' } }
      }
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }]
    },
    timeoutMs: 300000,
    async execute(args, exec) {
      const { run } = await import('./src/core.js')
      return run(args, { signal: exec?.signal })
    }
  })
}
