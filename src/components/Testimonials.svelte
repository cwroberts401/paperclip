<script lang="ts">
  const reviews = [
    {
      stars: 5,
      text: 'Held my TPS reports together through three rounds of revisions.',
      author: 'Dave, Middle Management',
    },
    {
      stars: 5,
      text: "I've been using paperclips for 30 years and this is, without question, a paperclip.",
      author: 'Susan K.',
    },
    {
      stars: 4,
      text: 'Lost one star because I dropped it and it took 3 minutes to find. Otherwise flawless.',
      author: 'Anonymous',
    },
    {
      stars: 5,
      text: 'Replaced my entire workflow. Used to use hope. Now I use these.',
      author: 'Marcus T., Freelancer',
    },
  ];

  let scrollContainer: HTMLDivElement;
  let activeIndex = $state(0);

  function handleScroll() {
    if (!scrollContainer) return;
    const scrollLeft = scrollContainer.scrollLeft;
    const cardWidth = scrollContainer.children[0]?.getBoundingClientRect().width ?? 260;
    activeIndex = Math.round(scrollLeft / (cardWidth + 16));
  }
</script>

<section class="py-20">
  <div class="px-6">
    <h2 class="font-heading text-2xl font-bold text-center mb-2">Reviews</h2>
    <p class="text-sm text-text-secondary text-center italic mb-10">
      Real people. Real paperclips. Real satisfaction.
    </p>
  </div>

  <div
    bind:this={scrollContainer}
    onscroll={handleScroll}
    class="flex gap-4 overflow-x-auto snap-x snap-mandatory px-6 pb-4 scrollbar-hide"
    style="-webkit-overflow-scrolling: touch; scrollbar-width: none;"
  >
    {#each reviews as review, i}
      <div class="snap-center shrink-0 w-[260px] bg-surface rounded-2xl p-6 flex flex-col">
        <div class="text-accent-secondary mb-3 text-sm tracking-wider">
          {'★'.repeat(review.stars)}{'☆'.repeat(5 - review.stars)}
        </div>
        <p class="text-sm leading-relaxed flex-1 mb-4">"{review.text}"</p>
        <p class="text-xs text-text-secondary">— {review.author}</p>
      </div>
    {/each}
  </div>

  <div class="flex justify-center gap-2 mt-6">
    {#each reviews as _, i}
      <div
        class="w-2 h-2 rounded-full transition-all duration-300"
        style="background: {i === activeIndex ? '#2563EB' : '#d6d3d1'}"
      ></div>
    {/each}
  </div>
</section>

<style>
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
</style>
