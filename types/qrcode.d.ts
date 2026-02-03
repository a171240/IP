declare module "qrcode" {
  const QRCode: {
    toDataURL: (text: string, options?: { [key: string]: unknown }) => Promise<string>
  }
  export default QRCode
}
