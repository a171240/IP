import archiver from "archiver"
import { PassThrough } from "stream"
import { DeliveryFile } from "./render"

export async function createZipBuffer(files: DeliveryFile[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } })
    const stream = new PassThrough()
    const chunks: Buffer[] = []

    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)))
    stream.on("end", () => resolve(Buffer.concat(chunks)))
    stream.on("error", reject)
    archive.on("error", reject)

    archive.pipe(stream)

    files.forEach((file) => {
      archive.append(file.buffer, { name: file.name })
    })

    try {
      archive.finalize()
    } catch (error) {
      reject(error)
    }
  })
}
