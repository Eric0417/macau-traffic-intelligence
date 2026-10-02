import { describe, expect, it } from "vitest";
import { normalizeBorderStatuses } from "@/server/sources/borders";

describe("normalizeBorderStatuses", () => {
  it("maps official status codes and aggregates each checkpoint", () => {
    const statuses = normalizeBorderStatuses({
      Rs: true,
      Rt: [
        { Pn: "2", Id: "D", St: "1", Ti: "2026/10/03 00:21", Vt: "0", Os: "0", Mp: "", Mc: "" },
        { Pn: "2", Id: "E", St: "3", Ti: "2026/10/03 00:22", Vt: "0", Os: "0", Mp: "", Mc: "" },
        { Pn: "55", Id: "D", St: "2", Ti: "2026/10/03 00:22", Vt: "0", Os: "0", Mp: "", Mc: "" },
      ],
    });

    const portas = statuses.find((status) => status.id === "portas-do-cerco");
    const qingmao = statuses.find((status) => status.id === "qingmao");

    expect(portas).toMatchObject({
      status: "busy",
      estimatedWaitMinutes: 45,
      updatedAt: "2026-10-02T16:22:00.000Z",
    });
    expect(qingmao).toMatchObject({
      status: "busy",
      estimatedWaitMinutes: 30,
    });
    expect(statuses).toHaveLength(8);
  });
});
