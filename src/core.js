import { resolveWorkspace } from './utils.js'

export async function run(args, ctx = {}) {
  const action = args.action
  const workspace = await resolveWorkspace(args.workspace)

  switch (action) {
    case 'strategy': {
      const { buildStrategy } = await import('./query.js')
      return buildStrategy({ ...args, workspace })
    }
    case 'import': {
      const { importRecords } = await import('./store.js')
      return importRecords({ ...args, workspace })
    }
    case 'search_ops': {
      const { searchOps } = await import('./ops.js')
      return searchOps({ ...args, workspace, signal: ctx.signal })
    }
    case 'workset': {
      const { workset } = await import('./store.js')
      return workset({ ...args, workspace })
    }
    case 'annotate': {
      const { annotate } = await import('./store.js')
      return annotate({ ...args, workspace })
    }
    case 'analyze': {
      const { analyze } = await import('./analyze.js')
      return analyze({ ...args, workspace })
    }
    case 'report': {
      const { report } = await import('./report.js')
      return report({ ...args, workspace })
    }
    case 'status': {
      const { status } = await import('./store.js')
      return status({ ...args, workspace })
    }
    default:
      throw new Error(`Unsupported action: ${action}`)
  }
}
