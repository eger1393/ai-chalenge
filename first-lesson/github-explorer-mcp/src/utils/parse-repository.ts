const VALID_NAME_REGEX = /^[a-zA-Z0-9._-]+$/;

export function parseRepository(input: string): { owner: string; repo: string } {
  const trimmed = input.trim().replace(/\/+$/, '');

  let owner: string;
  let repo: string;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    let pathname: string;
    try {
      const url = new URL(trimmed);
      pathname = url.pathname;
    } catch {
      throw new Error(
        `Invalid repository format: "${input}". Expected "owner/repo" or a GitHub URL (https://github.com/owner/repo).`
      );
    }

    const segments = pathname.split('/').filter((s) => s.length > 0);
    if (segments.length < 2) {
      throw new Error(
        `Invalid repository format: "${input}". Expected "owner/repo" or a GitHub URL (https://github.com/owner/repo).`
      );
    }

    owner = segments[0];
    repo = segments[1];
  } else {
    const parts = trimmed.split('/');
    if (parts.length !== 2) {
      throw new Error(
        `Invalid repository format: "${input}". Expected "owner/repo" or a GitHub URL (https://github.com/owner/repo).`
      );
    }

    owner = parts[0];
    repo = parts[1];
  }

  if (!owner || !repo || !VALID_NAME_REGEX.test(owner) || !VALID_NAME_REGEX.test(repo)) {
    throw new Error(
      `Invalid repository format: "${input}". Expected "owner/repo" or a GitHub URL (https://github.com/owner/repo).`
    );
  }

  return { owner, repo };
}
