import { SkeletonPage, SkeletonSection } from "@/components/Skeleton";

export default function Loading() {
  return (
    <SkeletonPage>
      <SkeletonSection titleWidth="w-40" />
      <SkeletonSection titleWidth="w-32" />
    </SkeletonPage>
  );
}