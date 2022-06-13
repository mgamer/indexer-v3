export abstract class BaseDataSource {
  public abstract getSequenceData(
    cursor: string | null,
    limit: number
  ): Promise<getSequenceDataResult>;
}

export type getSequenceDataResult = {
  data: Record<string, unknown>[];
  nextCursor: string | null;
};
