import {
  DiscoveredVideo,
  DiscoveryQueryContext,
  IDiscoveryProvider,
} from './types';

/**
 * ============================================================================
 * DETERMINISTIC DEVELOPMENT DISCOVERY PROVIDER
 * ============================================================================
 * 
 * Returns deterministic test sources representing 5 distinct quality levels:
 * 
 * A. Highly compelling niche source (High relevance, High engagement, High short-form, High quality -> Ranks #1)
 * B. Good but ordinary source (Solid relevance and quality, moderate engagement/short-form -> Ranks #2)
 * C. Niche-relevant but boring source (High relevance to niche/subtopics, but dry, monotone, low short-form potential -> Lower rank)
 * D. Highly popular but weak short-form source (2.4M views, but diffuse live stream with no self-contained clips -> Lower rank, proves popularity != clip quality!)
 * E. Irrelevant source (Off-topic content -> Rejected by pipeline with clear rejection reason)
 * 
 * Note: Metric figures in development mode are synthetic values provided specifically
 * for testing and verifying the multi-factor ranking algorithm.
 */
export class DevelopmentDiscoveryProvider implements IDiscoveryProvider {
  public readonly name = 'development';

  public async isAvailable(): Promise<{ available: boolean }> {
    return { available: true };
  }

  public async search(context: DiscoveryQueryContext): Promise<DiscoveredVideo[]> {
    const rawNiche = (context.niche || 'Technology & Innovation').trim();
    const nicheLower = rawNiche.toLowerCase();
    const subtopics =
      context.subtopics && context.subtopics.length > 0
        ? context.subtopics
        : [rawNiche];

    const sub1 = subtopics[0] || rawNiche;
    const sub2 = subtopics[1] || subtopics[0] || rawNiche;
    const slug = rawNiche.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 10);

    // ------------------------------------------------------------------------
    // FIT / ATHLETICS / HEALTH DOMAIN
    // ------------------------------------------------------------------------
    if (
      nicheLower.includes('fit') ||
      nicheLower.includes('gym') ||
      nicheLower.includes('workout') ||
      nicheLower.includes('muscle') ||
      nicheLower.includes('bodybuild') ||
      nicheLower.includes('health') ||
      nicheLower.includes('exercise') ||
      nicheLower.includes('athletic')
    ) {
      return [
        // A. Highly compelling niche source
        {
          id: `dev_fit_${slug}_001`,
          title: `The Mechanical Tension Myth: Why 80% of Lifters Waste Their Top Sets in ${sub1}`,
          description: `Evidence-based biomechanics breakdown challenging consensus gym dogma. Explains why chasing arbitrary pump metrics causes rapid fatigue without hypertrophy in ${sub1}, and introduces the 3-rule tension protocol that fixes it. Synthetic test metrics for ranking verification.`,
          channelTitle: 'Frontier Sports Science & Hypertrophy Lab',
          duration: '26:15',
          durationSeconds: 1575,
          viewCount: 340000,
          likeCount: 22400,
          commentCount: 1520,
          publishedAt: '3 days ago',
          youtubeUrl: `dev://test-source/dev_fit_${slug}_001`,
          summary: `High-curiosity breakdown challenging standard volume advice with empirical electromyography data. Features punchy counter-intuitive arguments, quotable rules, and actionable tension frameworks for ${sub1}.`,
          niche: sub1,
          matchedSubtopics: [sub1],
          thumbnailGradient: 'from-emerald-950 via-teal-900 to-slate-950',
          relevanceScore: 96,
          is_development_source: true,
          isDevelopmentSource: true,
          isSyntheticData: true,
        },
        // B. Good but ordinary source
        {
          id: `dev_fit_${slug}_002`,
          title: `Complete Evidence-Based Hypertrophy Fundamentals & Recovery Timelines for ${sub2}`,
          description: `Comprehensive textbook overview of muscle protein synthesis, sleep architecture, and macronutrient periodization in ${sub2}. Well-structured and educational with reliable fundamentals. Synthetic test metrics for ranking verification.`,
          channelTitle: 'Clinical Nutrition & Physiology Institute',
          duration: '34:20',
          durationSeconds: 2060,
          viewCount: 185000,
          likeCount: 8200,
          commentCount: 460,
          publishedAt: '5 days ago',
          youtubeUrl: `dev://test-source/dev_fit_${slug}_002`,
          summary: `Solid educational guide covering recovery fundamentals and progressive overload tracking for ${sub2}. Dependable structure with standard explanatory delivery.`,
          niche: sub2,
          matchedSubtopics: [sub2],
          thumbnailGradient: 'from-teal-900 via-emerald-950 to-slate-950',
          relevanceScore: 90,
          is_development_source: true,
          isDevelopmentSource: true,
          isSyntheticData: true,
        },
        // C. Niche-relevant but boring source
        {
          id: `dev_fit_${slug}_003`,
          title: `Histological Cross-Section Analysis of Sarcoplasmic Protein Densities in In-Vitro Rodent Fibers`,
          description: `Formal academic laboratory seminar examining microscopic cross-sections of actin-myosin cross-bridge kinetics during repeated electrical stimulation in ${sub1}. 68 minutes of uninterrupted slide reading in a monotone voice. Synthetic test metrics for ranking verification.`,
          channelTitle: 'Journal of Cellular Myology Archives',
          duration: '68:45',
          durationSeconds: 4125,
          viewCount: 32000,
          likeCount: 710,
          commentCount: 35,
          publishedAt: '2 weeks ago',
          youtubeUrl: `dev://test-source/dev_fit_${slug}_003`,
          summary: `Technically accurate histology lecture on fiber mechanics in ${sub1}. Dense academic terminology delivered in a flat monotone; lacks hook inflections, visual contrast, or self-contained short-form takeaways.`,
          niche: sub1,
          matchedSubtopics: [sub1],
          thumbnailGradient: 'from-slate-900 via-zinc-900 to-slate-950',
          relevanceScore: 92,
          is_development_source: true,
          isDevelopmentSource: true,
          isSyntheticData: true,
        },
        // D. Highly popular but weak short-form source
        {
          id: `dev_fit_${slug}_004`,
          title: `2.4M Views Celebration Live Stream: Q&A Hangout, Merch Giveaway & Sponsor Announcements`,
          description: `A 2-hour casual live stream celebration with audience superchats, merchandise unboxing, gym story banter, and sponsor shoutouts for ${sub1}. Huge view count and channel popularity, but diffuse unscripted conversation with no standalone short-form moments. Synthetic test metrics for ranking verification.`,
          channelTitle: 'Gym Bros Worldwide Daily',
          duration: '1:54:10',
          durationSeconds: 6850,
          viewCount: 2450000,
          likeCount: 164000,
          commentCount: 13800,
          publishedAt: '4 days ago',
          youtubeUrl: `dev://test-source/dev_fit_${slug}_004`,
          summary: `High-traffic live stream recording celebrating channel subscriber milestones in ${sub1}. Diffuse stream banter, sponsor plugs, and casual conversation lacking extractable 30-60s self-contained clips.`,
          niche: sub1,
          matchedSubtopics: [sub1],
          thumbnailGradient: 'from-amber-950 via-slate-900 to-black',
          relevanceScore: 74,
          is_development_source: true,
          isDevelopmentSource: true,
          isSyntheticData: true,
        },
        // E. Irrelevant source
        {
          id: `dev_fit_${slug}_005`,
          title: `Top 10 Cutest Funny Animals and Pet Reactions (Viral Compilation 2026)`,
          description: `Wholesome compilation of kittens, golden retriever puppies, and talking parrots reacting to mirrors and playing in the backyard with rubber balls.`,
          channelTitle: 'Fluffy Pets Daily Laughs',
          duration: '11:20',
          durationSeconds: 680,
          viewCount: 890000,
          likeCount: 65000,
          commentCount: 4200,
          publishedAt: '1 day ago',
          youtubeUrl: `dev://test-source/dev_fit_${slug}_005`,
          summary: `Humorous animal reaction compilation with funny sound effects and cute moments. Designed to test pipeline rejection of off-topic content.`,
          niche: 'Cute Animals',
          thumbnailGradient: 'from-purple-950 via-pink-950 to-slate-950',
          relevanceScore: 12,
          is_development_source: true,
          isDevelopmentSource: true,
          isSyntheticData: true,
        },
      ];
    }

    // ------------------------------------------------------------------------
    // TECH / SOFTWARE / AI / ENGINEERING DOMAIN (DEFAULT)
    // ------------------------------------------------------------------------
    return [
      // A. Highly compelling niche source
      {
        id: `dev_tech_${slug}_001`,
        title: `Why Autonomous Agent Frameworks Fail in Production (And the 3-Rule Architecture That Fixed Ours)`,
        description: `Engineering post-mortem exposing the dirty truth about agent tool hallucination, infinite loop traps, and state collapse in ${sub1}. Contrasts consensus hype against empirical production benchmarks, detailing the exact deterministic state-machine architecture that solved reliability. Synthetic test metrics for ranking verification.`,
        channelTitle: 'Autonomous Systems & Systems Architecture Lab',
        duration: '24:50',
        durationSeconds: 1490,
        viewCount: 320000,
        likeCount: 21800,
        commentCount: 1650,
        publishedAt: '2 days ago',
        youtubeUrl: `dev://test-source/dev_tech_${slug}_001`,
        summary: `High-conviction architectural post-mortem challenging consensus framework dogma in ${sub1}. Features provocative opening hook, empirical contrast, and a clear 3-rule tactical payoff for vertical clips.`,
        niche: sub1,
        matchedSubtopics: [sub1],
        thumbnailGradient: 'from-blue-950 via-indigo-950 to-slate-900',
        relevanceScore: 97,
        is_development_source: true,
        isDevelopmentSource: true,
        isSyntheticData: true,
      },
      // B. Good but ordinary source
      {
        id: `dev_tech_${slug}_002`,
        title: `Standard Best Practices for Distributed Key-Value Store Deployment and ${sub2}`,
        description: `Thorough tutorial examining Raft consensus, replica health checks, and connection pooling in ${sub2}. Step-by-step architectural guide with clear explanations and code samples. Synthetic test metrics for ranking verification.`,
        channelTitle: 'Distributed Systems & Cloud Engineering',
        duration: '32:15',
        durationSeconds: 1935,
        viewCount: 175000,
        likeCount: 7600,
        commentCount: 390,
        publishedAt: '5 days ago',
        youtubeUrl: `dev://test-source/dev_tech_${slug}_002`,
        summary: `Solid educational guide detailing deployment architecture and cluster scaling for ${sub2}. Informative and structured with standard technical pacing.`,
        niche: sub2,
        matchedSubtopics: [sub2],
        thumbnailGradient: 'from-cyan-950 via-slate-900 to-blue-950',
        relevanceScore: 92,
        is_development_source: true,
        isDevelopmentSource: true,
        isSyntheticData: true,
      },
      // C. Niche-relevant but boring source
      {
        id: `dev_tech_${slug}_003`,
        title: `Exhaustive Formal Verification of Paxos State Machine Transitions Using TLA+ Proof Trees`,
        description: `Advanced academic conference seminar walking through 72 slides of formal math proofs, temporal logic invariants, and inductive assertions for distributed consensus in ${sub1}. Delivered in a monotone academic presentation with zero short-form moments. Synthetic test metrics for ranking verification.`,
        channelTitle: 'Formal Methods & Verification Working Group',
        duration: '74:30',
        durationSeconds: 4470,
        viewCount: 28000,
        likeCount: 640,
        commentCount: 28,
        publishedAt: '3 weeks ago',
        youtubeUrl: `dev://test-source/dev_tech_${slug}_003`,
        summary: `Formal verification lecture on distributed consensus proofs in ${sub1}. Pure academic recitation lacking visual tension, hook inflection, or standalone short-form segments.`,
        niche: sub1,
        matchedSubtopics: [sub1],
        thumbnailGradient: 'from-slate-900 via-neutral-900 to-slate-950',
        relevanceScore: 91,
        is_development_source: true,
        isDevelopmentSource: true,
        isSyntheticData: true,
      },
      // D. Highly popular but weak short-form source
      {
        id: `dev_tech_${slug}_004`,
        title: `2.4M Views Celebration Live Stream: Silicon Valley Keynote, Channel Merch & Sponsor Announcements`,
        description: `A 2-hour live stream hangout celebrating subscriber milestones with channel giveaways, partner awards announcements, hardware merchandise reveal, and general community Q&A. Massive view count, but diffuse stream chatter with no self-contained vertical moments. Synthetic test metrics for ranking verification.`,
        channelTitle: 'Silicon Valley Tech Live',
        duration: '1:58:20',
        durationSeconds: 7100,
        viewCount: 2450000,
        likeCount: 172000,
        commentCount: 14800,
        publishedAt: '4 days ago',
        youtubeUrl: `dev://test-source/dev_tech_${slug}_004`,
        summary: `High-traffic anniversary stream recording in ${sub1}. Contains long sponsor segments, community banter, and diffuse Q&A lacking crisp standalone clip boundaries.`,
        niche: sub1,
        matchedSubtopics: [sub1],
        thumbnailGradient: 'from-amber-950 via-slate-900 to-black',
        relevanceScore: 76,
        is_development_source: true,
        isDevelopmentSource: true,
        isSyntheticData: true,
      },
      // E. Irrelevant source
      {
        id: `dev_tech_${slug}_005`,
        title: `Top 10 Cutest Funny Animals and Pet Reactions (Viral Compilation 2026)`,
        description: `Cute compilation of puppies, kittens, and talking parrots doing hilarious stunts in living rooms.`,
        channelTitle: 'Fluffy Pets Daily Laughs',
        duration: '11:20',
        durationSeconds: 680,
        viewCount: 890000,
        likeCount: 65000,
        commentCount: 4200,
        publishedAt: '1 day ago',
        youtubeUrl: `dev://test-source/dev_tech_${slug}_005`,
        summary: `Viral animal reaction compilation with funny sound effects. Designed to test pipeline rejection of off-topic content.`,
        niche: 'Cute Animals',
        thumbnailGradient: 'from-purple-950 via-pink-950 to-slate-950',
        relevanceScore: 12,
        is_development_source: true,
        isDevelopmentSource: true,
        isSyntheticData: true,
      },
    ];
  }
}
