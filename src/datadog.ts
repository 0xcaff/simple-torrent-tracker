export class Datadog {
  constructor(private apiKey: string) {}

  async log(messages: any[]) {
    const url = `https://http-intake.logs.datadoghq.com/api/v2/logs`;
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "DD-API-KEY": this.apiKey,
      },
      body: JSON.stringify(
        messages.map((message) => ({
          message,
          hostname: "cloudflare",
          service: "tracker",
          ddtags: "env:prod",
        })),
      ),
    });
  }
}
