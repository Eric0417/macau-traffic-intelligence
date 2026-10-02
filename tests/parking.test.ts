import { describe, expect, it } from "vitest";
import { parseParkingHtml } from "@/server/sources/parking";

const parkingHtml = `
<table>
  <tr>
    <td><div class="carpark_name_text"><div>下環街市</div><div>2026-10-02 23:52:12</div></div></td>
    <td>
      <div><img src="./images/carpark_car.png"> 13</div>
      <div><img src="./images/carpark_motor.png"> 48</div>
      <div><img src="./images/carpark_ecar.png"> 4</div>
      <div><img src="./images/carpark_emotor.png"> 10</div>
      <div><img src="./images/carpark_disabled.png"> 2</div>
    </td>
    <td><a href="carpark_detail.aspx?id=6033">></a></td>
  </tr>
  <tr>
    <td><div class="carpark_name_text"><div>蓮花路 (重型)</div><div>2026-10-02 23:51:48</div></div></td>
    <td>
      <div><img src="./images/carpark_car.png"> -</div>
      <div><img src="./images/lt_8m.png"> 149</div>
      <div><img src="./images/gt_8m.png"> 47</div>
    </td>
    <td><a href="carpark_detail.aspx?id=7085">></a></td>
  </tr>
</table>
`;

describe("loadParking", () => {
  it("reads each vehicle icon independently", () => {
    const facilities = parseParkingHtml(parkingHtml);

    expect(facilities).toHaveLength(2);
    expect(facilities[0].availability).toMatchObject({
      lightVehicle: 13,
      motorcycle: 48,
      electricVehicle: 4,
      electricMotorcycle: 10,
      accessible: 2,
    });
    expect(facilities[1].availability).toMatchObject({
      lightVehicle: null,
      heavyVehicleShort: 149,
      heavyVehicleLong: 47,
    });
  });
});
