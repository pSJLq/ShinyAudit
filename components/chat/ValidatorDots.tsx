"use client";

/**
 * 3 validator subcommittee animation — three small squares that pulse
 * independently while validating, all sync + flash lime on consensus.
 */
interface Props {
  status: "queued" | "running" | "done" | "error";
}

export function ValidatorDots({ status }: Props) {
  return (
    <span className={"validator-dots " + status} title="3-validator subcommittee">
      <span className="vd" style={{ animationDelay: "0ms" }} />
      <span className="vd" style={{ animationDelay: "200ms" }} />
      <span className="vd" style={{ animationDelay: "400ms" }} />
    </span>
  );
}
