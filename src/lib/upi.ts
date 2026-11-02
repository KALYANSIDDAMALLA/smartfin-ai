/** A UPI id looks like name@bank. Shared by the verify and payout forms. */
export const UPI_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/;
/** "rahul@okhdfc" -> "ra••••@okhdfc". The full id is never stored. */
export const maskUpi = (u: string) => { const [h, d] = u.split("@"); return `${h.slice(0, 2)}${"•".repeat(Math.max(2, h.length - 2))}@${d}`; };
