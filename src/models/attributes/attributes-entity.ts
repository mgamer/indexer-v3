// Define the fields we can update
export type AttributesEntityUpdateParams = {
  tokenCount?: number;
  onSaleCount?: number;
  floorSellValue?: number | null;
  topBuyValue?: number | null;
  sellUpdatedAt?: string | null;
  buyUpdatedAt?: string | null;
};

export type AttributesEntityParams = {
  id: number;
  attribute_key_id: number;
  value: string;
  token_count: number;
  on_sale_count: number;
  floor_sell_value: number;
  top_buy_value: number;
  sell_updated_at: string;
  buy_updated_at: string;
};

export class AttributesEntity {
  id: number;
  attributeKeyId: number;
  value: string;
  tokenCount: number;
  onSaleCount: number;
  floorSellValue: number;
  topBuyValue: number;
  sellUpdatedAt: string;
  buyUpdatedAt: string;

  constructor(params: AttributesEntityParams) {
    this.id = params.id;
    this.attributeKeyId = params.attribute_key_id;
    this.value = params.value;
    this.tokenCount = params.token_count;
    this.onSaleCount = params.on_sale_count;
    this.floorSellValue = params.floor_sell_value;
    this.topBuyValue = params.top_buy_value;
    this.sellUpdatedAt = params.sell_updated_at;
    this.buyUpdatedAt = params.buy_updated_at;
  }
}
