import { githubGet } from '../github-api.js';

interface SearchResponse {
  items: Array<{
    name: string;
    full_name: string;
    description: string | null;
    stargazers_count: number;
    language: string | null;
    html_url: string;
  }>;
}

export async function searchRepos(args: { query: string }): Promise<string> {
  const data = await githubGet<SearchResponse>('/search/repositories', {
    q: args.query,
    per_page: '10',
  });

  const results = data.items.map((item) => ({
    name: item.name,
    full_name: item.full_name,
    description: item.description,
    stars: item.stargazers_count,
    language: item.language,
    url: item.html_url,
  }));

  return JSON.stringify(results, null, 2);
}
