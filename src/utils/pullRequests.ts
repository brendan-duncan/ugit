import { ipcRenderer } from 'electron';

// Creating a pull request through the host's API, for the four hosts that cover
// almost every remote: GitHub, GitLab, Bitbucket and Azure DevOps. Each wants a
// different URL shape and a different way of carrying the token, so the remote's
// URL is parsed into the pieces they have in common first.

export type PullRequestHost = 'github' | 'gitlab' | 'bitbucket' | 'azure' | 'unknown';

/** A remote URL, broken into what the APIs need. */
export interface RemoteTarget {
  host: PullRequestHost;
  // Hostname of the remote, e.g. 'github.com' or a self-hosted GitLab.
  hostname: string;
  // Owner/organization, and the repository name.
  owner: string;
  repo: string;
  // Azure DevOps puts a project between the organization and the repository.
  project?: string;
}

/**
 * Parse a git remote URL, in either the https or the scp-like ssh form.
 * @returns The pieces, or null when the URL can't be read
 */
export function parseRemoteUrl(remoteUrl: string): RemoteTarget | null {
  if (!remoteUrl)
    return null;

  let hostname = '';
  let pathPart = '';

  const sshMatch = /^(?:ssh:\/\/)?(?:[^@]+@)([^:/]+)[:/](.+)$/.exec(remoteUrl.trim());
  if (sshMatch) {
    hostname = sshMatch[1];
    pathPart = sshMatch[2];
  } else {
    try {
      const parsed = new URL(remoteUrl.trim());
      hostname = parsed.hostname;
      pathPart = parsed.pathname.replace(/^\//, '');
    } catch (error) {
      return null;
    }
  }

  pathPart = pathPart.replace(/\.git$/, '').replace(/\/$/, '');
  const segments = pathPart.split('/').filter(Boolean);
  // A local path parses as a URL with a drive letter for a scheme and no host,
  // which is no more a pull request host than a plain folder is.
  if (!hostname || segments.length < 2)
    return null;

  const host: PullRequestHost =
    hostname.includes('github') ? 'github' :
    hostname.includes('gitlab') ? 'gitlab' :
    hostname.includes('bitbucket') ? 'bitbucket' :
    (hostname.includes('azure') || hostname.includes('visualstudio')) ? 'azure' : 'unknown';

  if (host === 'azure') {
    // https form: dev.azure.com/<org>/<project>/_git/<repo>
    const gitIndex = segments.indexOf('_git');
    if (gitIndex > 0) {
      return {
        host,
        hostname,
        owner: segments[0],
        project: segments.slice(1, gitIndex).join('/') || segments[0],
        repo: segments[gitIndex + 1] || ''
      };
    }

    // ssh form: ssh.dev.azure.com:v3/<org>/<project>/<repo>, where 'v3' is the
    // protocol version rather than part of the path.
    if (segments[0] === 'v3' && segments.length >= 4) {
      return {
        host,
        hostname,
        owner: segments[1],
        project: segments[2],
        repo: segments[3]
      };
    }
  }

  return {
    host,
    hostname,
    // A GitLab project can sit in nested groups, which all belong to the owner part.
    owner: segments.slice(0, -1).join('/'),
    repo: segments[segments.length - 1]
  };
}

/** How each host names the thing being created, for the dialog's wording. */
export function requestNoun(host: PullRequestHost): string {
  return host === 'gitlab' ? 'merge request' : 'pull request';
}

export interface CreateRequest {
  target: RemoteTarget;
  title: string;
  description: string;
  // Branch being proposed, and the branch it should go into.
  sourceBranch: string;
  targetBranch: string;
  token: string;
  // API base override, for self-hosted installs.
  apiBase?: string;
}

export interface CreateResult {
  ok: boolean;
  status: number;
  // URL of the created request, when the host returned one.
  url?: string;
  error?: string;
}

/** The API call for one host: where to POST, how to authenticate, and the body. */
function buildCall(request: CreateRequest): {
  url: string;
  auth: 'bearer' | 'token' | 'basic' | 'private-token';
  body: any;
  headers?: Record<string, string>;
} | null {
  const { target, title, description, sourceBranch, targetBranch } = request;
  const base = (request.apiBase || '').replace(/\/$/, '');

  switch (target.host) {
    case 'github': {
      // github.com uses api.github.com; an Enterprise install uses /api/v3.
      const root = base || (target.hostname === 'github.com'
        ? 'https://api.github.com'
        : `https://${target.hostname}/api/v3`);
      return {
        url: `${root}/repos/${target.owner}/${target.repo}/pulls`,
        auth: 'bearer',
        headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
        body: { title, body: description, head: sourceBranch, base: targetBranch }
      };
    }

    case 'gitlab': {
      const root = base || `https://${target.hostname}/api/v4`;
      const project = encodeURIComponent(`${target.owner}/${target.repo}`);
      return {
        url: `${root}/projects/${project}/merge_requests`,
        auth: 'private-token',
        body: {
          title,
          description,
          source_branch: sourceBranch,
          target_branch: targetBranch
        }
      };
    }

    case 'bitbucket': {
      const root = base || 'https://api.bitbucket.org/2.0';
      return {
        url: `${root}/repositories/${target.owner}/${target.repo}/pullrequests`,
        auth: 'bearer',
        body: {
          title,
          description,
          source: { branch: { name: sourceBranch } },
          destination: { branch: { name: targetBranch } }
        }
      };
    }

    case 'azure': {
      const root = base || `https://dev.azure.com/${target.owner}`;
      const project = encodeURIComponent(target.project || target.owner);
      return {
        // Azure DevOps wants the API version in the query string.
        url: `${root}/${project}/_apis/git/repositories/${target.repo}/pullrequests?api-version=7.1`,
        // A personal access token goes in as the password of basic auth.
        auth: 'basic',
        body: {
          title,
          description,
          sourceRefName: `refs/heads/${sourceBranch}`,
          targetRefName: `refs/heads/${targetBranch}`
        }
      };
    }

    default:
      return null;
  }
}

/** Where the host put the request it just created. */
function resultUrl(host: PullRequestHost, body: any): string | undefined {
  if (!body)
    return undefined;
  if (host === 'github')
    return body.html_url;
  if (host === 'gitlab')
    return body.web_url;
  if (host === 'bitbucket')
    return body.links?.html?.href;
  if (host === 'azure') {
    const repoUrl = body.repository?.webUrl;
    return repoUrl && body.pullRequestId ? `${repoUrl}/pullrequest/${body.pullRequestId}` : undefined;
  }
  return undefined;
}

/** Ask the host to open the pull request. The call itself runs in the main process. */
export async function createPullRequest(request: CreateRequest): Promise<CreateResult> {
  const call = buildCall(request);
  if (!call)
    return { ok: false, status: 0, error: "ugit doesn't know this host's API." };

  const response = await ipcRenderer.invoke('create-pull-request', {
    url: call.url,
    token: request.token,
    auth: call.auth,
    body: call.body,
    headers: call.headers
  });

  if (response?.ok) {
    return { ok: true, status: response.status, url: resultUrl(request.target.host, response.body) };
  }

  // Hosts explain refusals in different fields; show whichever one is there.
  const body = response?.body;
  const detail = body?.message || body?.error || body?.errors?.[0]?.message
    || (Array.isArray(body?.message) ? body.message.join(', ') : null)
    || response?.raw || response?.error;

  return {
    ok: false,
    status: response?.status ?? 0,
    error: detail ? String(detail) : `The host answered with ${response?.status ?? 'no status'}.`
  };
}

/** For the dialog: what to call the token each host expects. */
export function tokenHint(host: PullRequestHost): string {
  switch (host) {
    case 'github': return 'A personal access token with pull request write access';
    case 'gitlab': return 'A personal access token with the api scope';
    case 'bitbucket': return 'An app password or access token with pull request write access';
    case 'azure': return 'A personal access token with Code (read & write)';
    default: return 'An API token for this host';
  }
}
