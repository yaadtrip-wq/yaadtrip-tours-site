// functions/debug.js
export default async () => {
  return new Response("Functions are now active!", { status: 200 });
};

export const config = { runtime: "edge" };