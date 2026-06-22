import Image from "next/image";
import Link from "next/link";

type ModuleButtonProps = { iconSrc: string; iconAlt: string; href?: string; onClick?: () => void; onTouchEnd?: () => void; width?: number; height?: number; imageScale?: number; hoverBackImage?: string; hoverBackImagePosition?: "top-left" | "top-right" };

export function ModuleButton({ iconSrc, iconAlt, href, onClick, onTouchEnd, width = 390, height = 260, imageScale, hoverBackImage, hoverBackImagePosition = "top-left" }: ModuleButtonProps) {
  const imageWrapperClass = imageScale != null ? "relative shrink-0" : "relative h-full w-full";
  const imageWrapperStyle = imageScale != null ? { width: `${imageScale * 100}%`, height: `${imageScale * 100}%` } : undefined;
  const content = (
    <div className="module-btn-icon relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl">
      <div className={imageWrapperClass} style={imageWrapperStyle}>
        <Image src={iconSrc} alt={iconAlt} fill className={imageScale != null ? "object-contain" : "object-cover"} sizes={`${width}px`} />
      </div>
    </div>
  );
  const baseClasses = "module-btn relative z-10 flex w-full max-w-full items-center justify-center rounded-xl border-6 border-gray-100 bg-white p-0 overflow-visible transition-colors hover:border-[#54D3DA] hover:bg-gray-50 focus:border-[#54D3DA] focus:bg-gray-50 focus-visible:outline-none shrink-0 cursor-pointer md:w-[390px] md:max-w-[390px]";
  const style = { width: "100%", maxWidth: `${width}px`, aspectRatio: `${width}/${height}` };
  const buttonOrLink = href ? (
    <Link href={href} className={baseClasses} style={style} onTouchEnd={onTouchEnd}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} onTouchEnd={onTouchEnd} className={baseClasses} style={style}>
      {content}
    </button>
  );
  if (hoverBackImage) {
    const isTopRight = hoverBackImagePosition === "top-right";
    const positionStyle = isTopRight
      ? { right: 0, top: 0, width: "78%", height: "95%", transform: "translate(48%, -48%)" }
      : { left: 0, top: 0, width: "70%", height: "90%", transform: "translate(-45%, -45%)" };
    const objectPos = isTopRight ? "object-contain object-right-top" : "object-contain object-left-top";
    return (
      <div className="module-btn group relative inline-block w-full max-w-full overflow-visible md:w-[390px] md:max-w-[390px]" style={{ width: "100%", maxWidth: `${width}px`, aspectRatio: `${width}/${height}` }}>
        <div className="pointer-events-none absolute z-0" style={positionStyle}>
          <div className="module-btn-cat relative h-full w-full opacity-0 scale-90 transition-all duration-300 ease-out">
            <Image src={hoverBackImage} alt="" fill className={objectPos} sizes="360px" />
          </div>
        </div>
        {buttonOrLink}
      </div>
    );
  }
  return buttonOrLink;
}
