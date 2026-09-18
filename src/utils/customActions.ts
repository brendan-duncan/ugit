import { ipcRenderer } from 'electron';
import { CustomAction } from './settings';

// User-defined commands in the context menus. The command line is the user's
// own, so ugit only fills in the placeholders and runs it in the repository.

/** What a custom action can be told about where it was invoked from. */
export interface CustomActionContext {
  repoPath: string;
  // The file it was invoked on, and every selected file.
  filePath?: string;
  filePaths?: string[];
  commitHash?: string;
  branchName?: string;
  remoteUrl?: string;
}

/** The placeholders a command can use, with what each one means. */
export const PLACEHOLDERS: Array<{ token: string; meaning: string }> = [
  { token: '$REPO', meaning: 'Path to the repository' },
  { token: '$FILE', meaning: 'The file the action was invoked on' },
  { token: '$FILES', meaning: 'Every selected file, space separated and quoted' },
  { token: '$SHA', meaning: 'The commit the action was invoked on' },
  { token: '$BRANCH', meaning: 'The branch the action was invoked on' },
  { token: '$REMOTE_URL', meaning: "The origin's URL" }
];

/** Quote a path for the shell that will run the command. */
function quote(value: string): string {
  if (!value)
    return '""';
  // Windows shells take double quotes; POSIX shells accept them too, and a path
  // is the only thing being substituted here.
  return /[\s"&|<>^]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Fill a command's placeholders in from where it was invoked. */
export function expandCommand(command: string, context: CustomActionContext): string {
  const files = (context.filePaths && context.filePaths.length > 0
    ? context.filePaths
    : context.filePath ? [context.filePath] : []).map(quote).join(' ');

  return command
    .replace(/\$REMOTE_URL/g, quote(context.remoteUrl || ''))
    .replace(/\$REPO/g, quote(context.repoPath))
    .replace(/\$FILES/g, files)
    .replace(/\$FILE/g, quote(context.filePath || (context.filePaths || [])[0] || ''))
    .replace(/\$SHA/g, context.commitHash || '')
    .replace(/\$BRANCH/g, context.branchName || '');
}

/** The actions that belong in a given context menu. */
export function actionsFor(actions: CustomAction[] | undefined, target: CustomAction['target']): CustomAction[] {
  return (actions || []).filter(action => action.target === target && action.name.trim() && action.command.trim());
}

export interface CustomActionResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

/** The prefix a context menu uses for a custom action, so it routes to the right one. */
export const ACTION_PREFIX = 'custom:';

/** The action a menu item refers to, or null when the item isn't a custom one. */
export function actionFromMenuId(menuId: string, actions: CustomAction[] | undefined): CustomAction | null {
  if (!menuId.startsWith(ACTION_PREFIX))
    return null;
  const id = menuId.slice(ACTION_PREFIX.length);
  return (actions || []).find(action => action.id === id) || null;
}

/**
 * What to tell the user after an action ran: its output when they asked for it,
 * and always something when it failed.
 */
export function describeResult(action: CustomAction, result: CustomActionResult): string | null {
  if (result.ok && !action.showOutput)
    return null;

  const output = [result.stdout, result.stderr]
    .map(part => (part || '').trim())
    .filter(Boolean)
    .join('\n\n');

  if (result.ok)
    return output || 'Finished with no output.';

  return `Exited with code ${result.code}.${output ? `\n\n${output.slice(0, 4000)}` : ''}`;
}

/** Run an action, with the repository as its working directory. */
export async function runCustomAction(action: CustomAction,
                                      context: CustomActionContext): Promise<CustomActionResult> {
  const command = expandCommand(action.command, context);
  return ipcRenderer.invoke('run-custom-action', command, context.repoPath);
}
