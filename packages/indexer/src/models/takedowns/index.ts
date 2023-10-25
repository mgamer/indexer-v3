import { redis } from "@/common/redis";

export class Takedowns {
  public static takedowns: { [id: string]: boolean } = {};

  public static async add(type: string, ids: string[]): Promise<void> {
    if (ids.length) {
      await redis.hset(`takedown-${type}`, ids, ids);

      for (const id of ids) {
        this.takedowns[id] = true;
      }
    }
  }

  public static async delete(type: string, ids: string[]): Promise<void> {
    if (ids.length) {
      await redis.hdel(`takedown-${type}`, ids);
      this.takedowns = {};
    }
  }

  public static async get(type: string, ids: string[]): Promise<(string | null)[]> {
    const result: (string | null)[] = [];

    ids = ids.filter((id) => {
      const isTakedown = this.takedowns[id];
      if (isTakedown) {
        result.push(id);
      }
      return !(id in this.takedowns);
    });

    if (ids.length) {
      const takedowns = await redis.hmget(`takedown-${type}`, ids);
      for (let i = 0; i < ids.length; i++) {
        if (takedowns[i]) {
          result.push(ids[i]);
          this.takedowns[ids[i]] = true;
        } else {
          this.takedowns[ids[i]] = false;
        }
      }
    }

    return result;
  }

  public static async isTakedown(type: string, id: string): Promise<boolean> {
    const result = await redis.hget(`takedown-${type}`, id);
    return result !== null;
  }

  // --- Tokens --- //

  public static async addTokens(ids: string[]): Promise<void> {
    await Takedowns.add("token", ids);
  }

  public static async addToken(contract: string, tokenId: string): Promise<void> {
    await Takedowns.addTokens([`${contract}:${tokenId}`]);
  }

  public static async deleteTokens(ids: string[]): Promise<void> {
    await Takedowns.delete("token", ids);
  }

  public static async getTokens(
    tokens: { contract: string; tokenId: string; collectionId: string }[]
  ): Promise<(string | null)[]> {
    const result: (string | null)[] = [];

    const tokenTakedowns = await Takedowns.get(
      "token",
      tokens.map((t) => `${t.contract}:${t.tokenId}`)
    );
    const collectionTakedowns = await Takedowns.getCollections(tokens.map((t) => t.collectionId));

    for (let i = 0; i < tokens.length; i++) {
      if (tokenTakedowns[i] || collectionTakedowns[i]) {
        result.push(`${tokens[i].contract}:${tokens[i].tokenId}`);
        this.takedowns[`${tokens[i].contract}:${tokens[i].tokenId}`] = true;

        if (collectionTakedowns[i]) {
          this.takedowns[tokens[i].collectionId] = true;
        }
      } else {
        this.takedowns[`${tokens[i].contract}:${tokens[i].tokenId}`] = false;
        this.takedowns[tokens[i].collectionId] = false;
      }
    }

    return result;
  }

  public static async isTakedownToken(contract: string, tokenId: string): Promise<boolean> {
    return await Takedowns.isTakedown("token", `${contract}:${tokenId}`);
  }

  // --- Collections --- //

  public static async addCollections(ids: string[]): Promise<void> {
    await Takedowns.add("collection", ids);
  }

  public static async deleteCollections(ids: string[]): Promise<void> {
    await Takedowns.delete("collection", ids);
  }

  public static async getCollections(ids: string[]): Promise<(string | null)[]> {
    return Takedowns.get("collection", ids);
  }

  public static async isTakedownCollection(id: string): Promise<boolean> {
    return Takedowns.isTakedown("collection", id);
  }
}
