import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  return new Stripe(key, { apiVersion: "2024-04-10" });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const serviceSupabase = createServiceClient();

    const { data: parent, error: parentError } = await serviceSupabase
      .from("parents")
      .select("id, email, stripe_customer_id, consent_verified")
      .eq("id", user.id)
      .single();

    if (parentError && parentError.code !== "PGRST116") {
      return NextResponse.json(
        { error: "Failed to load parent record" },
        { status: 500 }
      );
    }

    let parentRecord: typeof parent = parent;
    let stripeCustomerId = parent?.stripe_customer_id;

    if (!parentRecord) {
      const { data: inserted, error: insertError } = await serviceSupabase
        .from("parents")
        .insert({
          id: user.id,
          email: user.email ?? "",
          consent_verified: false,
        })
        .select()
        .single();

      if (insertError || !inserted) {
        return NextResponse.json(
          { error: "Failed to create parent record" },
          { status: 500 }
        );
      }

      parentRecord = inserted;
      stripeCustomerId = inserted.stripe_customer_id;
    }

    if (!parentRecord) {
      return NextResponse.json(
        { error: "Failed to load parent record" },
        { status: 500 }
      );
    }

    if (parentRecord.consent_verified) {
      return NextResponse.json(
        { error: "Consent already verified" },
        { status: 400 }
      );
    }

    if (!stripeCustomerId) {
      const stripe = getStripe();
      const customer = await stripe.customers.create({
        email: parentRecord.email,
        metadata: { parent_id: parentRecord.id },
      });
      stripeCustomerId = customer.id;

      const { error: updateError } = await serviceSupabase
        .from("parents")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", parentRecord.id);

      if (updateError) {
        return NextResponse.json(
          { error: "Failed to save Stripe customer" },
          { status: 500 }
        );
      }
    }

    const stripe = getStripe();
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 100,
      currency: "usd",
      customer: stripeCustomerId,
      capture_method: "manual",
      metadata: { parent_id: parentRecord.id },
    });

    return NextResponse.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error("Consent intent error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
