import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { formatEther } from "@ethersproject/units";

export const bn = (value: BigNumberish) => BigNumber.from(value);

export const formatEth = (wei: BigNumberish) => Number(Number(formatEther(wei)).toFixed(5));

export const fromBuffer = (buffer: Buffer) => "0x" + buffer.toString("hex");

export const toBuffer = (hexValue: string) => Buffer.from(hexValue.slice(2), "hex");

/**
 * Split a continuation string based on a regular expression
 * The continuation string can be either a regular string or base64 encoded string.
 *
 * @param cont
 * @param regEx
 */
export const splitContinuation = (cont: string, regEx: RegExp) => {
  // underscores are not in base64, we should remove this part once it's rolled out and assume everything is
  // base64 encoded
  if (cont.includes("_")) {
    return cont.split("_");
  }

  cont = decodeURIComponent(cont);

  // If it matches a base64 string, it might be really base64, we don't know until we decode
  if (cont.match(base64Regex)) {
    const decoded = Buffer.from(cont, "base64").toString("ascii");
    if (decoded.match(regEx)) {
      return decoded.split("_");
    }
  }

  // We failed to decode the base64 string and compare it to our regex, so return whatever we passed
  return cont;
};

export const buildContinuation = (cont: string) => Buffer.from(cont).toString("base64");

export const base64Regex = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
