import { redis } from "@/common/redis";

export class Takedowns {
  public static async add(type: string, id: string): Promise<void> {
    await redis.hset(`takedown-${type}`, id, id);
  }

  public static async delete(type: string, id: string): Promise<void> {
    await redis.hdel(`takedown-${type}`, id);
  }

  public static async get(type: string, ids: string[]): Promise<(string | null)[]> {
    if (ids.length) {
      return await redis.hmget(`takedown-${type}`, ids);
    } else {
      return [];
    }
  }

  public static async isTakedown(type: string, id: string): Promise<boolean> {
    const result = await redis.hget(`takedown-${type}`, id);
    return result !== null;
  }

  // --- Tokens --- //

  public static async addToken(id: string): Promise<void> {
    await Takedowns.add("token", id);
  }

  public static async deleteToken(id: string): Promise<void> {
    await Takedowns.delete("token", id);
  }

  public static async getTokens(ids: string[], collectionId?: string): Promise<(string | null)[]> {
    if (collectionId && (await Takedowns.isTakedownCollection(collectionId))) {
      return ids;
    }

    return Takedowns.get("token", ids);
  }

  public static async isTakedownToken(contract: string, tokenId: string): Promise<boolean> {
    return Takedowns.isTakedown("token", `${contract}:${tokenId}`);
  }

  // --- Collections --- //

  public static async addCollection(id: string): Promise<void> {
    await Takedowns.add("collection", id);
  }

  public static async deleteCollection(id: string): Promise<void> {
    await Takedowns.delete("collection", id);
  }

  public static async getCollections(ids: string[]): Promise<(string | null)[]> {
    return Takedowns.get("collection", ids);
  }

  public static async isTakedownCollection(id: string): Promise<boolean> {
    return Takedowns.isTakedown("collection", id);
  }
}
