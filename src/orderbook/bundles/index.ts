import { idb, pgp } from "@/common/db";

export const create = async (
  tokenSets: {
    kind: "ft" | "nft";
    id: string;
  }[],
  metadata?: object
) => {
  const newBundleResult: { id: string } | null = await idb.oneOrNone(
    `
      INSERT INTO bundles (metadata) VALUES ($/metadata/)
      RETURNING bundles.id
    `,
    { metadata }
  );
  if (!newBundleResult) {
    throw new Error("Could not create bundle");
  }

  const columns = new pgp.helpers.ColumnSet(["bundle_id", "kind", "token_set_id"], {
    table: "bundle_items",
  });
  const values = tokenSets.map(({ kind, id }) => ({
    bundle_id: newBundleResult.id,
    kind,
    token_set_id: id,
  }));

  await idb.none(
    `
      INSERT INTO bundle_items (
        bundle_id,
        kind,
        token_set_id
      ) VALUES ${pgp.helpers.values(values, columns)}
    `
  );

  return newBundleResult.id;
};
