import { redis } from "@/common/redis";

export class MetadataStatus {
  public static disabled: { [id: string]: boolean } = {};

  public static async disable(type: string, ids: string[]): Promise<void> {
    if (ids.length) {
      await redis.hset(`metadata-disabled-${type}`, ids, ids);

      for (const id of ids) {
        MetadataStatus.disabled[id] = true;
      }
    }
  }

  public static async enable(type: string, ids: string[]): Promise<void> {
    if (ids.length) {
      await redis.hdel(`metadata-disabled-${type}`, ids);
      MetadataStatus.disabled = {};
    }
  }

  public static async get(type: string, ids: string[]): Promise<(string | null)[]> {
    const result: (string | null)[] = [];

    ids = ids.filter((id) => {
      const isDisabled = MetadataStatus.disabled[id];
      if (isDisabled) {
        result.push(id);
      }
      return !(id in MetadataStatus.disabled);
    });

    if (ids.length) {
      const disabled = await redis.hmget(`metadata-disabled-${type}`, ids);
      for (let i = 0; i < ids.length; i++) {
        if (disabled[i]) {
          result.push(ids[i]);
          MetadataStatus.disabled[ids[i]] = true;
        } else {
          MetadataStatus.disabled[ids[i]] = false;
        }
      }
    }

    return result;
  }

  public static async isDisabled(type: string, id: string): Promise<boolean> {
    const result = await redis.hget(`metadata-disabled-${type}`, id);
    return result !== null;
  }

  // --- Tokens --- //

  public static async disableTokens(ids: string[]): Promise<void> {
    await MetadataStatus.disable("token", ids);
  }

  public static async enableTokens(ids: string[]): Promise<void> {
    await MetadataStatus.enable("token", ids);
  }

  public static async getTokens(
    tokens: { contract: string; tokenId: string; collectionId: string }[]
  ): Promise<(string | null)[]> {
    const result: (string | null)[] = [];

    const disabledTokens = await MetadataStatus.get(
      "token",
      tokens.map((t) => `${t.contract}:${t.tokenId}`)
    );
    const disabledCollections = await MetadataStatus.getCollections(
      tokens.map((t) => t.collectionId)
    );

    for (let i = 0; i < tokens.length; i++) {
      if (disabledTokens[i] || disabledCollections[i]) {
        result.push(`${tokens[i].contract}:${tokens[i].tokenId}`);
        MetadataStatus.disabled[`${tokens[i].contract}:${tokens[i].tokenId}`] = true;

        if (disabledCollections[i]) {
          MetadataStatus.disabled[tokens[i].collectionId] = true;
        }
      } else {
        MetadataStatus.disabled[`${tokens[i].contract}:${tokens[i].tokenId}`] = false;
        MetadataStatus.disabled[tokens[i].collectionId] = false;
      }
    }

    return result;
  }

  public static async isDisabledToken(contract: string, tokenId: string): Promise<boolean> {
    return await MetadataStatus.isDisabled("token", `${contract}:${tokenId}`);
  }

  // --- Collections --- //

  public static async disableCollections(ids: string[]): Promise<void> {
    await MetadataStatus.disable("collection", ids);
  }

  public static async enableCollections(ids: string[]): Promise<void> {
    await MetadataStatus.enable("collection", ids);
  }

  public static async getCollections(ids: string[]): Promise<(string | null)[]> {
    return MetadataStatus.get("collection", ids);
  }

  public static async isDisabledCollection(id: string): Promise<boolean> {
    return MetadataStatus.isDisabled("collection", id);
  }
}
