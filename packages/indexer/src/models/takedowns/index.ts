import { redis } from "@/common/redis";
import { format } from "date-fns";
import _ from "lodash";
import { config } from "@/config/index";

export class Takedowns {
  public static async add(type: string, id: string): Promise<void> {
    const date = format(new Date(_.now()), "yyyy-MM-dd HH:mm:ss");
    await redis.hset(`takedown-${type}:${config.chainId}`, id, date);
  }

  public static async delete(type: string, id: string): Promise<void> {
    await redis.hdel(`takedown-${type}:${config.chainId}`, id);
  }

  public static async get(type: string, ids: string[]): Promise<string[]> {
    const results = await redis.hmget(`takedown-${type}:${config.chainId}`, ids);
    return Object.keys(results.filter((r) => r !== null));
  }

  public static async isTakedown(type: string, id: string): Promise<boolean> {
    const result = await redis.hget(`takedown-${type}:${config.chainId}`, id);
    return result !== null;
  }

  // --- Tokens --- //

  public static async addToken(id: string): Promise<void> {
    await Takedowns.add("token", id);
  }

  public static async deleteToken(id: string): Promise<void> {
    await Takedowns.delete("token", id);
  }

  public static async getTokens(ids: string[], collectionId?: string): Promise<string[]> {
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

  public static async getCollections(ids: string[]): Promise<string[]> {
    return Takedowns.get("collection", ids);
  }

  public static async isTakedownCollection(id: string): Promise<boolean> {
    return Takedowns.isTakedown("collection", id);
  }
}
