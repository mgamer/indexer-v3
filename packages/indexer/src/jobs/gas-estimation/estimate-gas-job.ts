import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { GasEstimationTranscation, processGasEstimation } from "@/utils/gas-estimation";

export class EstimateGasJob extends AbstractRabbitMqJobHandler {
  queueName = "estimate-gas";
  maxRetries = 5;
  concurrency = 10;
  lazyMode = true;
  consumerTimeout = 60000;
  backoff = {
    type: "exponential",
    delay: 1000,
  } as BackoffStrategy;

  protected async process(payload: GasEstimationTranscation[]) {
    const allTransactions = payload;
    await processGasEstimation(allTransactions);
  }

  public async addToQueue(infos: GasEstimationTranscation[][]) {
    await this.sendBatch(infos.map((info) => ({ payload: info })));
  }
}

export const estimateGasJob = new EstimateGasJob();
