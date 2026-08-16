// ============================================================
// GitHub Gist API Service
// ============================================================

import { GistResponse } from '../types';

const GITHUB_API = 'https://api.github.com/gists';

export const createOrUpdateGist = async (
  token: string,
  filename: string,
  content: string,
  description: string,
  gistId?: string
): Promise<GistResponse> => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };

  const body: any = {
    description,
    files: { [filename]: { content } },
  };
  if (!gistId) body.public = false;

  const url = gistId ? `${GITHUB_API}/${gistId}` : GITHUB_API;
  const method = gistId ? 'PATCH' : 'POST';

  const res = await fetch(url, { method, headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `GitHub API error: ${res.status}`);
  }
  return res.json();
};
