import { PaymentsView } from "@/components/payments-view";
import type { SP } from "@/lib/server/range";
export default async function Page({ searchParams }: { searchParams: Promise<SP> }) { return <PaymentsView channel="online" sp={await searchParams} />; }
