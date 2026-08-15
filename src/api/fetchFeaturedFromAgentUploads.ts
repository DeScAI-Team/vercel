import { fetchArweaveDocument } from "@/api/arweaveLoader";
import { prefetchReviewVisualsFromTagEntries } from "@/api/resolveReviewVisual";
import { getArweaveGatewayBaseUrl, getOverviewAgentAddress } from "@/api/fetchOverviewSidebarsFromArweave";

type ArweaveTag = { name: string; value: string };

type GqlEdge = {
  cursor: string;
  node: {
    id: string;
    tags: ArweaveTag[];
    block: { timestamp: number } | null;
  };
};

type GqlTransactionsResponse = {
  data?: {
    transactions?: {
      pageInfo?: { hasNextPage?: boolean };
      edges?: GqlEdge[];
    };
  };
  errors?: Array<{ message?: string }>;
};

type ArweaveDocument = Record<string, unknown>;

export type FeaturedUploadSummary = {
  txid: string;
  platform: string;
  composite_score: number | null;
  null_category_count: number;
  review_date: string | null;
  published_at: string | null;
};

export type FeaturedIndexResult = {
  featuredTxids: string[];
  summaries: FeaturedUploadSummary[];
};

const FEATURED_CAROUSEL_SIZE = 6;
const FEATURED_PER_PLATFORM = 2;
const FEATURED_CANDIDATES_PER_PLATFORM = 20;
const FEATURED_MOLECULE_CANDIDATE_LIMIT = 50;
const FEATURED_MAX_GRAPHQL_PAGES = 6;
const FEATURED_PLATFORMS = ["Molecule", "PumpScience", "ResearchHub"] as const;

const FEATURED_REVIEW_TAG_FILTERS = [{ name: "doctype", values: ["review"] }] as const;

const FEATURED_TX_QUERY = `
  query FeaturedTxs($owners: [String!]!, $tags: [TagFilter!]!, $after: String) {
    transactions(owners: $owners, tags: $tags, first: 100, after: $after) {
      pageInfo {
        hasNextPage
      }
      edges {
        cursor
        node {
          id
          tags {
            name
            value
          }
          block {
            timestamp
          }
        }
      }
    }
  }
`;

let featuredCache: FeaturedIndexResult | null = null;
let featuredIndexPromise: Promise<FeaturedIndexResult> | null = null;

const readNumber = (record: ArweaveDocument, keys: string[]): number | null => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return null;
};

const readString = (record: ArweaveDocument, keys: string[]): string | null => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
};

const publishedTime = (iso: string | null): number =>
  iso && Number.isFinite(new Date(iso).getTime()) ? new Date(iso).getTime() : Number.NEGATIVE_INFINITY;

const recencyTime = (summary: FeaturedUploadSummary): number => {
  const published = publishedTime(summary.published_at);
  if (published !== Number.NEGATIVE_INFINITY) return published;
  return publishedTime(summary.review_date);
};

const compareFeaturedSummaries = (left: FeaturedUploadSummary, right: FeaturedUploadSummary) => {
  const recencyDelta = recencyTime(right) - recencyTime(left);
  if (recencyDelta !== 0) {
    return recencyDelta;
  }

  const scoreDelta = (right.composite_score ?? Number.NEGATIVE_INFINITY) - (left.composite_score ?? Number.NEGATIVE_INFINITY);
  if (scoreDelta !== 0) {
    return scoreDelta;
  }

  return left.null_category_count - right.null_category_count;
};

const readPlatformFromTags = (tags: ArweaveTag[]): string | null => {
  for (const tag of tags) {
    if (tag.name?.toLowerCase() === "platform" && tag.value?.trim()) {
      return tag.value.trim();
    }
  }
  return null;
};

const normalizePlatformKey = (value: string) => value.trim().toLowerCase().replace(/[.\s_-]/g, "");

const canonicalFeaturedPlatform = (raw: string | null | undefined): (typeof FEATURED_PLATFORMS)[number] | null => {
  if (!raw?.trim()) return null;
  const key = normalizePlatformKey(raw);
  return FEATURED_PLATFORMS.find((platform) => normalizePlatformKey(platform) === key) ?? null;
};

const countNullCategoryScores = (document: ArweaveDocument): number => {
  const rawCategories = document.categories;
  if (!rawCategories || typeof rawCategories !== "object" || Array.isArray(rawCategories)) {
    return Number.POSITIVE_INFINITY;
  }

  let nullCount = 0;
  for (const value of Object.values(rawCategories as Record<string, unknown>)) {
    if (!value || typeof value !== "object") {
      nullCount += 1;
      continue;
    }

    if (readNumber(value as ArweaveDocument, ["score"]) === null) {
      nullCount += 1;
    }
  }

  return nullCount;
};

const pickTopReviewsPerPlatform = (ranked: FeaturedUploadSummary[]): FeaturedUploadSummary[] => {
  const byPlatform = new Map<string, FeaturedUploadSummary[]>();

  for (const summary of ranked) {
    const platform = canonicalFeaturedPlatform(summary.platform);
    if (!platform) continue;

    const list = byPlatform.get(platform) ?? [];
    list.push(summary);
    byPlatform.set(platform, list);
  }

  const picked: FeaturedUploadSummary[] = [];

  for (const platform of FEATURED_PLATFORMS) {
    const summaries = [...(byPlatform.get(platform) ?? [])].sort(compareFeaturedSummaries);
    picked.push(...summaries.slice(0, FEATURED_PER_PLATFORM));
  }

  return picked.slice(0, FEATURED_CAROUSEL_SIZE);
};

const fetchReviewEdges = async (agentAddress: string, signal?: AbortSignal) => {
  const gatewayBase = getArweaveGatewayBaseUrl();
  const graphqlUrl = `${gatewayBase}/graphql`;
  const edges: GqlEdge[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;
  let pagesFetched = 0;

  while (hasNextPage && pagesFetched < FEATURED_MAX_GRAPHQL_PAGES) {
    const response = await fetch(graphqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        query: FEATURED_TX_QUERY,
        variables: {
          owners: [agentAddress],
          tags: FEATURED_REVIEW_TAG_FILTERS,
          after: cursor
        }
      }),
      signal
    });

    if (!response.ok) {
      throw new Error(`Arweave GraphQL request failed (${response.status})`);
    }

    const payload = (await response.json()) as GqlTransactionsResponse;
    if (payload.errors?.length) {
      const message = payload.errors.map((entry) => entry.message).filter(Boolean).join("; ");
      throw new Error(message || "Arweave GraphQL returned errors");
    }

    const page = payload.data?.transactions;
    const batch = page?.edges ?? [];
    if (!batch.length) {
      break;
    }

    edges.push(...batch);

    hasNextPage = Boolean(page?.pageInfo?.hasNextPage);
    cursor = batch[batch.length - 1]?.cursor ?? null;
    pagesFetched += 1;

    if (!hasNextPage || !cursor) {
      break;
    }
  }

  return edges;
};

const selectCandidateEdgesByPlatform = (edges: GqlEdge[]): GqlEdge[] => {
  const selected: GqlEdge[] = [];
  const seen = new Set<string>();

  for (const platform of FEATURED_PLATFORMS) {
    const candidateLimit = platform === "Molecule" ? FEATURED_MOLECULE_CANDIDATE_LIMIT : FEATURED_CANDIDATES_PER_PLATFORM;
    const matches = edges
      .filter(
        (edge) => canonicalFeaturedPlatform(readPlatformFromTags(edge.node.tags ?? [])) === platform
      )
      .sort((left, right) => (right.node.block?.timestamp ?? 0) - (left.node.block?.timestamp ?? 0))
      .slice(0, candidateLimit);

    for (const edge of matches) {
      if (!seen.has(edge.node.id)) {
        selected.push(edge);
        seen.add(edge.node.id);
      }
    }
  }

  return selected;
};

const buildFeaturedSummaries = async (edges: GqlEdge[]): Promise<FeaturedUploadSummary[]> => {
  const settled = await Promise.allSettled(
    edges.map(async (edge) => {
      const document = await fetchArweaveDocument(edge.node.id);
      const blockTimestampSec = edge.node.block?.timestamp;
      const published_at =
        typeof blockTimestampSec === "number" && Number.isFinite(blockTimestampSec)
          ? new Date(blockTimestampSec * 1000).toISOString()
          : null;

      const platform = readPlatformFromTags(edge.node.tags ?? []) ?? readString(document, ["platform"]) ?? "Other";
      const composite_score = readNumber(document, ["composite_score", "average_score"]);

      return {
        txid: edge.node.id,
        platform,
        composite_score,
        null_category_count: countNullCategoryScores(document),
        review_date: readString(document, ["review_date", "date", "created_at"]),
        published_at
      } satisfies FeaturedUploadSummary;
    })
  );

  return settled
    .filter((result): result is PromiseFulfilledResult<FeaturedUploadSummary | null> => result.status === "fulfilled")
    .map((result) => result.value)
    .filter((summary): summary is FeaturedUploadSummary => summary !== null && summary.composite_score !== null)
    .sort(compareFeaturedSummaries);
};

const emptyFeaturedResult = (): FeaturedIndexResult => ({
  featuredTxids: [],
  summaries: []
});

export function getCachedFeaturedTxids(): string[] {
  return featuredCache?.featuredTxids ?? [];
}

/**
 * Returns six carousel txids from agent reviews with a composite score:
 * the two most recent reviews each for Molecule, PumpScience, and ResearchHub.
 * Ties break on composite_score, then fewest null category scores.
 */
export async function fetchFeaturedFromAgentUploads(
  forceRefresh = false,
  signal?: AbortSignal
): Promise<FeaturedIndexResult> {
  if (!forceRefresh && featuredCache) {
    return featuredCache;
  }

  if (!forceRefresh && featuredIndexPromise) {
    return featuredIndexPromise;
  }

  featuredIndexPromise = (async () => {
    const agentAddress = getOverviewAgentAddress();
    if (!agentAddress) {
      return emptyFeaturedResult();
    }

    const edges = await fetchReviewEdges(agentAddress, signal);
    const candidateEdges = selectCandidateEdgesByPlatform(edges);
    if (!candidateEdges.length) {
      return emptyFeaturedResult();
    }

    const ranked = await buildFeaturedSummaries(candidateEdges);
    const topSummaries = pickTopReviewsPerPlatform(ranked);
    const topTxids = new Set(topSummaries.map((summary) => summary.txid));
    const topTagEntries = edges
      .filter((edge) => topTxids.has(edge.node.id))
      .map((edge) => ({ txid: edge.node.id, tags: edge.node.tags ?? [] }));

    prefetchReviewVisualsFromTagEntries(topTagEntries);

    const result: FeaturedIndexResult = {
      featuredTxids: topSummaries.map((summary) => summary.txid),
      summaries: topSummaries
    };

    featuredCache = result;
    return result;
  })();

  try {
    return await featuredIndexPromise;
  } catch (error) {
    featuredIndexPromise = null;
    throw error;
  } finally {
    featuredIndexPromise = null;
  }
}
