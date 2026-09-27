import { createFileRoute } from "@tanstack/react-router";
import { FlightApp } from "@/game/FlightApp";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <FlightApp />;
}
