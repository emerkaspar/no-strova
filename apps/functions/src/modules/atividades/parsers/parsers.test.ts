import { describe, expect, it } from "vitest";
import { ArquivoInvalidoError, extensaoValida, lerArquivo } from "./index";

const gpx = (pontos: string, tipo = "<type>cycling</type>") =>
  `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <trk>${tipo}<trkseg>${pontos}</trkseg></trk>
</gpx>`;

const ponto = (i: number, hr?: number) =>
  `<trkpt lat="${-30 + i * 0.0001}" lon="-51.2"><ele>${10 + i}</ele><time>2026-10-20T10:00:${String(i).padStart(2, "0")}Z</time>${
    hr === undefined ? "" : `<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${hr}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>`
  }</trkpt>`;

describe("GPX", () => {
  it("lê tempo, posição, altitude e FC das extensões da Garmin", async () => {
    const r = await lerArquivo(Buffer.from(gpx([0, 1, 2, 3].map((i) => ponto(i, 140 + i)).join(""))), "gpx");
    expect(r.amostras).toHaveLength(4);
    expect(r.amostras[0]).toMatchObject({ t: 0, fc: 140, alt: 10 });
    expect(r.amostras[3]).toMatchObject({ t: 3, fc: 143 });
    expect(r.amostras[1].lat).toBeCloseTo(-29.9999, 4);
    expect(r.inicioMs).toBe(Date.parse("2026-10-20T10:00:00Z"));
    expect(r.esporteArquivo).toBe("cycling");
    expect(r.calorias).toBeNull();
  });

  it("aceita ponto sem FC e um único ponto por segmento", async () => {
    const r = await lerArquivo(Buffer.from(gpx([0, 1].map((i) => ponto(i)).join(""))), "gpx");
    expect(r.amostras.every((a) => a.fc === undefined)).toBe(true);
  });

  it("descarta pontos sem hora e instantes repetidos", async () => {
    const semHora = `<trkpt lat="1" lon="1"><ele>5</ele></trkpt>`;
    const r = await lerArquivo(Buffer.from(gpx(semHora + ponto(0, 100) + ponto(0, 101) + ponto(1, 102))), "gpx");
    expect(r.amostras.map((a) => a.t)).toEqual([0, 1]);
  });

  it("rejeita XML sem <gpx>, sem pontos com hora e conteúdo que não é XML", async () => {
    await expect(lerArquivo(Buffer.from("<?xml version='1.0'?><foo/>"), "gpx")).rejects.toBeInstanceOf(ArquivoInvalidoError);
    await expect(lerArquivo(Buffer.from(gpx(`<trkpt lat="1" lon="1"/>`)), "gpx")).rejects.toBeInstanceOf(ArquivoInvalidoError);
  });
});

describe("TCX", () => {
  const tcx = (esporte: string, voltas: string) =>
    `<?xml version="1.0"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
  <Activities><Activity Sport="${esporte}"><Id>2026-10-20T10:00:00Z</Id>${voltas}</Activity></Activities>
</TrainingCenterDatabase>`;
  const tp = (s: number, hr: number, dist: number) =>
    `<Trackpoint><Time>2026-10-20T10:00:${String(s).padStart(2, "0")}Z</Time><Position><LatitudeDegrees>-30</LatitudeDegrees><LongitudeDegrees>-51</LongitudeDegrees></Position><AltitudeMeters>12.5</AltitudeMeters><DistanceMeters>${dist}</DistanceMeters><HeartRateBpm><Value>${hr}</Value></HeartRateBpm><Extensions><ns3:TPX><ns3:Speed>3.5</ns3:Speed></ns3:TPX></Extensions></Trackpoint>`;

  it("lê várias voltas, soma as calorias e pega FC, distância, altitude e velocidade", async () => {
    const voltas =
      `<Lap><Calories>100</Calories><Track>${tp(0, 130, 0)}${tp(1, 132, 3.5)}</Track></Lap>` +
      `<Lap><Calories>50</Calories><Track>${tp(2, 134, 7)}${tp(3, 136, 10.5)}</Track></Lap>`;
    const r = await lerArquivo(Buffer.from(tcx("Running", voltas)), "tcx");
    expect(r.amostras).toHaveLength(4);
    expect(r.amostras[2]).toMatchObject({ t: 2, fc: 134, dist: 7, alt: 12.5, vel: 3.5, lat: -30, lon: -51 });
    expect(r.calorias).toBe(150);
    expect(r.esporteArquivo).toBe("Running");
  });

  it("rejeita arquivo sem atividade ou sem pontos", async () => {
    await expect(lerArquivo(Buffer.from("<TrainingCenterDatabase/>"), "tcx")).rejects.toBeInstanceOf(ArquivoInvalidoError);
    await expect(lerArquivo(Buffer.from(tcx("Biking", "<Lap><Track/></Lap>")), "tcx")).rejects.toBeInstanceOf(ArquivoInvalidoError);
  });
});

describe("FIT", () => {
  it("rejeita arquivo que não é FIT", async () => {
    await expect(lerArquivo(Buffer.from("isto não é um arquivo fit"), "fit")).rejects.toBeInstanceOf(ArquivoInvalidoError);
    await expect(lerArquivo(Buffer.alloc(0), "fit")).rejects.toBeInstanceOf(ArquivoInvalidoError);
  });
});

describe("extensaoValida", () => {
  it("aceita só fit, gpx e tcx em minúsculas", () => {
    expect(["fit", "gpx", "tcx"].every(extensaoValida)).toBe(true);
    expect(["FIT", "exe", "", null, undefined, 1].some(extensaoValida)).toBe(false);
  });
});
