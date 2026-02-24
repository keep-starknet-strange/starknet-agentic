export function trimTrailingChar(input: string, charToTrim: string): string {
  let end = input.length;
  while (end > 0 && input.charAt(end - 1) === charToTrim) {
    end -= 1;
  }
  return input.slice(0, end);
}
