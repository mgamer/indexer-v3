export abstract class BaseDataSource {
  public abstract getData(cursor: string | null, limit: number): Promise<GetDataResult>;
}

export type GetDataResult = {
  data: Record<string, unknown>[];
  nextCursor: string | null;
};
