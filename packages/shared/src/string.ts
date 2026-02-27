export function trimTrailingChar(input: string, charToTrim: string): string {
  if (charToTrim.length !== 1) {
    throw new Error("charToTrim must be a single character");
  }
  let end = input.length;
  while (end > 0 && input.charAt(end - 1) === charToTrim) {
    end -= 1;
  }
  return input.slice(0, end);
}
