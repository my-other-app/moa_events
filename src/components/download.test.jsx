import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

/*
 * "Download" under the ticket: the #ticket element drawn to a canvas
 * (html2canvas) and saved as a PDF the canvas's size (jsPDF). Both libraries
 * are stand-ins here that record what they were asked.
 */
const made = vi.hoisted(() => ({ pdfs: [] }));
vi.mock("html2canvas", () => ({ default: vi.fn() }));
vi.mock("jspdf", () => ({
  default: class FakePdf {
    constructor(options) {
      this.options = options;
      this.addImage = vi.fn();
      this.save = vi.fn();
      made.pdfs.push(this);
    }
  },
}));

const { default: html2canvas } = await import("html2canvas");
const { default: Download } = await import("./download.jsx");

const canvas = (width = 900, height = 1400) => ({ width, height, toDataURL: vi.fn(() => "data:image/png;base64,AAAA") });

const page = () =>
  render(
    <>
      <div id="ticket">
        <h1>Hack Night 04</h1>
      </div>
      <Download />
    </>
  );

beforeEach(() => {
  vi.clearAllMocks();
  made.pdfs.length = 0;
});

describe("downloading the ticket as a PDF", () => {
  it("draws the ticket at twice its size and saves it as a PDF of the same size", async () => {
    const drawn = canvas();
    html2canvas.mockResolvedValue(drawn);
    page();
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => expect(made.pdfs).toHaveLength(1));
    expect(html2canvas).toHaveBeenCalledWith(document.getElementById("ticket"), { scale: 2 });
    expect(drawn.toDataURL).toHaveBeenCalledWith("image/png");
    const [pdf] = made.pdfs;
    expect(pdf.options).toEqual({ orientation: "portrait", unit: "px", format: [900, 1400] });
    expect(pdf.addImage).toHaveBeenCalledWith("data:image/png;base64,AAAA", "PNG", 0, 0, 900, 1400);
    expect(pdf.save).toHaveBeenCalledWith("ticket.pdf");
    expect(await screen.findByRole("button", { name: "Download" })).toBeEnabled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says it is preparing, and can't be pressed twice, while it draws", async () => {
    let finish;
    html2canvas.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    page();
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    const busy = await screen.findByRole("button", { name: "Preparing…" });
    expect(busy).toBeDisabled();
    fireEvent.click(busy);
    finish(canvas());
    expect(await screen.findByRole("button", { name: "Download" })).toBeEnabled();
    expect(html2canvas).toHaveBeenCalledTimes(1);
    expect(made.pdfs).toHaveLength(1);
  });

  it("says so when the ticket can't be drawn, and works when pressed again", async () => {
    html2canvas.mockRejectedValueOnce(new Error("tainted canvas")).mockResolvedValueOnce(canvas());
    page();
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The PDF couldn’t be made. Try again, or take a screenshot of the ticket.");
    expect(made.pdfs).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    await waitFor(() => expect(made.pdfs).toHaveLength(1));
    expect(made.pdfs[0].save).toHaveBeenCalledWith("ticket.pdf");
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("does nothing when there is no ticket on the page", () => {
    render(<Download />);
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(html2canvas).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Download" })).toBeEnabled();
  });
});
