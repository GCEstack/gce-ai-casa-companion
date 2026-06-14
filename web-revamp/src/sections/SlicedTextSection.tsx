import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const TEXT = 'PICK YOUR COMPANION';

export default function SlicedTextSection() {
  const sectionRef = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (!sectionRef.current) return;

    const letters = sectionRef.current.querySelectorAll('.letter-wrapper');
    letters.forEach((element, index) => {
      const isOdd = index % 2 === 0;
      gsap.fromTo(
        element,
        { y: isOdd ? '-40vh' : '40vh' },
        {
          y: isOdd ? '40vh' : '-40vh',
          ease: 'none',
          scrollTrigger: {
            trigger: element,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        }
      );
    });
  }, { scope: sectionRef });

  // Split text into letters, each with 5 vertical slices
  const renderSlicedLetter = (char: string, charIndex: number) => {
    if (char === ' ') {
      return <div key={charIndex} className="w-[0.3em]" />;
    }

    return (
      <div key={charIndex} className="flex mr-[0.05em]" style={{ display: 'flex', marginRight: '0.05em' }}>
        {[0, 1, 2, 3, 4].map((sliceIndex) => (
          <div
            key={sliceIndex}
            className="letter-wrapper"
            style={{
              flex: '1 1 0%',
              overflow: 'hidden',
              willChange: 'transform',
              clipPath: `polygon(${sliceIndex * 20}% 0%, ${(sliceIndex + 1) * 20}% 0%, ${(sliceIndex + 1) * 20}% 100%, ${sliceIndex * 20}% 100%)`,
            }}
          >
            <div
              className="letter-inner"
              style={{
                display: 'block',
                width: 'max-content',
                fontSize: 'clamp(2rem, 18vw, 12rem)',
                fontWeight: 900,
                lineHeight: 0.7,
                textTransform: 'uppercase',
                color: '#ffffff',
                letterSpacing: '-0.02em',
                marginLeft: `${-sliceIndex * 20}%`,
                paddingLeft: `${sliceIndex * 20}%`,
              }}
            >
              {char}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <section ref={sectionRef} className="relative min-h-[100dvh] flex items-center justify-center overflow-hidden py-20">
      <div
        className="flex flex-wrap justify-center items-center w-full max-w-[1000px] mx-auto"
        style={{ margin: '10vh auto 0' }}
      >
        {TEXT.split('').map((char, i) => renderSlicedLetter(char, i))}
      </div>
    </section>
  );
}
