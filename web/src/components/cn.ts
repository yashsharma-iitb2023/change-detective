import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// ponytail: hand-rolled tailwind, no shadcn install — this is the one utility that pattern needs.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
