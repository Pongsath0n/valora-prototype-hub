import { useQuery } from "@tanstack/react-query";
import { storeAdminApi, type SalesReportFiltersPayload, type SalesReportResponse } from "@/services/storeAdminApi";

export interface UseSalesReportOptions extends SalesReportFiltersPayload {
  enabled?: boolean;
}

export function useSalesReport(filters: UseSalesReportOptions) {
  return useQuery<SalesReportResponse, Error>({
    queryKey: ["sales-report", filters],
    queryFn: () => storeAdminApi.getSalesReport(filters),
    enabled: filters.enabled !== false,
  });
}
