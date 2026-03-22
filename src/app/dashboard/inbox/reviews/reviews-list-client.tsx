"use client";

import { ReviewCard } from "@/components/inbox/review-card";
import { EmptyState } from "@/components/empty-state";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Review = any;

interface ReviewsListClientProps {
  reviews: Review[];
}

export function ReviewsListClient({ reviews: initialReviews }: ReviewsListClientProps) {
  if (initialReviews.length === 0) {
    return (
      <EmptyState
        icon="★"
        title="No reviews yet"
        description="Reviews from Google Business Profile and Facebook will appear here once synced."
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      {initialReviews.map((review: Review) => (
        <ReviewCard
          key={review.id}
          review={review}
          onReplied={() => window.location.reload()}
        />
      ))}
    </div>
  );
}
