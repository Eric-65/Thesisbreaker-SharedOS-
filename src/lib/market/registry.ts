import type { AssetIdentity } from "./types";

/**
 * Registry of well-known Binance-tradable pairs so the search resolves
 * immediately without a provider round-trip. This is a routing table
 * only — every displayed price still comes from the live Binance
 * provider through the router.
 */

function pair(
  displayPair: string, // e.g. "BTC/USDT"
  displayName: string,
  binancePair: string,
  coingeckoId: string,
): AssetIdentity {
  const [, quote] = displayPair.split("/");
  return {
    symbol: displayPair,
    displayName,
    assetType: "CRYPTO",
    currency: quote ?? "USDT",
    tradableThroughAgent: true, // routable via Binance Agent OS spot
    binancePair,
    coingeckoId,
  };
}

export const CRYPTO: Record<string, AssetIdentity> = {
  "BTC/USDT": pair("BTC/USDT", "Bitcoin", "BTCUSDT", "bitcoin"),
  "ETH/USDT": pair("ETH/USDT", "Ethereum", "ETHUSDT", "ethereum"),
  "BNB/USDT": pair("BNB/USDT", "BNB", "BNBUSDT", "binancecoin"),
  "SOL/USDT": pair("SOL/USDT", "Solana", "SOLUSDT", "solana"),
  "XRP/USDT": pair("XRP/USDT", "XRP", "XRPUSDT", "ripple"),
  "DOGE/USDT": pair("DOGE/USDT", "Dogecoin", "DOGEUSDT", "dogecoin"),
  "AVAX/USDT": pair("AVAX/USDT", "Avalanche", "AVAXUSDT", "avalanche-2"),
  "LINK/USDT": pair("LINK/USDT", "Chainlink", "LINKUSDT", "chainlink"),
};

/** Featured NFT collections (research-only). */
export const NFTS: Record<string, AssetIdentity> = {
  pudgypenguins: nft("pudgypenguins", "Pudgy Penguins"),
  boredapeyachtclub: nft("boredapeyachtclub", "Bored Ape Yacht Club"),
  azuki: nft("azuki", "Azuki"),
  "doodles-official": nft("doodles-official", "Doodles"),
};

export function findByAny(query: string): AssetIdentity | null {
  const q = query.trim().toUpperCase();
  // Crypto match: "BTC", "BTCUSDT", "BTC/USDT"
  const cryptoMatch = Object.values(CRYPTO).find(
    (c) =>
      c.symbol === q ||
      c.binancePair === q.replace("/", "") ||
      c.symbol.split("/")[0] === q,
  );
  if (cryptoMatch) return cryptoMatch;

  const slug = query.trim().toLowerCase();
  if (NFTS[slug]) return NFTS[slug];
  return null;
}

function nft(slug: string, displayName: string): AssetIdentity {
  return {
    symbol: slug,
    displayName,
    assetType: "NFT_COLLECTION",
    currency: "ETH",
    tradableThroughAgent: false, // NFT market research only
    openSeaSlug: slug,
  };
}

export const FEATURED: AssetIdentity[] = [
  ...Object.values(CRYPTO),
  ...Object.values(NFTS),
];
