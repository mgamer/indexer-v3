export type MonthlyApiUsageEntityParams = {
  month: string;
  route: string;
  api_calls_count: number;
  api_key: string;
};

export class MonthlyApiUsageEntity {
  month: string;
  route: string;
  apiCallsCount: number;
  apiKey: string;

  constructor(params: MonthlyApiUsageEntityParams) {
    this.month = params.month;
    this.route = params.route;
    this.apiCallsCount = params.api_calls_count;
    this.apiKey = params.api_key;
  }
}
