export * as eip2981 from "@/utils/royalties/eip2981";

export type Royalty = {
  recipient: string;
  bps: number;
};
