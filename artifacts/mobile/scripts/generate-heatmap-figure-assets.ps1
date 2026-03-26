using namespace System.Drawing
using namespace System.Drawing.Drawing2D
using namespace System.Drawing.Imaging

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'

$width = 300
$height = 640
$centerX = $width / 2
$outDir = Join-Path $PSScriptRoot '..\assets\images\heatmap'

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$silhouette = [Color]::FromArgb(255, 47, 50, 56)
$hair = [Color]::FromArgb(255, 58, 59, 64)
$skin = [Color]::FromArgb(255, 209, 212, 216)
$muscle = [Color]::FromArgb(255, 231, 237, 243)
$white = [Color]::White

function New-PointArray {
  param([object[]]$Coords)

  $points = New-Object 'System.Collections.Generic.List[System.Drawing.PointF]'
  foreach ($coord in $Coords) {
    $points.Add([PointF]::new([single]$coord[0], [single]$coord[1]))
  }
  return $points.ToArray()
}

function Mirror-Points {
  param([PointF[]]$Points)

  $mirrored = New-Object 'System.Collections.Generic.List[System.Drawing.PointF]'
  foreach ($point in $Points) {
    $mirrored.Add([PointF]::new([single]($script:width - $point.X), [single]$point.Y))
  }
  return $mirrored.ToArray()
}

function Draw-Curve {
  param(
    [Graphics]$Graphics,
    [PointF[]]$Points,
    [Color]$FillColor,
    [Pen]$Pen,
    [float]$Tension = 0.4
  )

  $path = [GraphicsPath]::new()
  $path.AddClosedCurve($Points, $Tension)
  $brush = [SolidBrush]::new($FillColor)
  $Graphics.FillPath($brush, $path)
  if ($Pen) {
    $Graphics.DrawPath($Pen, $path)
  }
  $brush.Dispose()
  $path.Dispose()
}

function Draw-PolygonShape {
  param(
    [Graphics]$Graphics,
    [PointF[]]$Points,
    [Color]$FillColor,
    [Pen]$Pen
  )

  $brush = [SolidBrush]::new($FillColor)
  $Graphics.FillPolygon($brush, $Points)
  if ($Pen) {
    $Graphics.DrawPolygon($Pen, $Points)
  }
  $brush.Dispose()
}

function Draw-Ellipse {
  param(
    [Graphics]$Graphics,
    [float]$X,
    [float]$Y,
    [float]$W,
    [float]$H,
    [Color]$FillColor,
    [Pen]$Pen
  )

  $brush = [SolidBrush]::new($FillColor)
  $Graphics.FillEllipse($brush, $X, $Y, $W, $H)
  if ($Pen) {
    $Graphics.DrawEllipse($Pen, $X, $Y, $W, $H)
  }
  $brush.Dispose()
}

function Draw-MirroredPolygon {
  param(
    [Graphics]$Graphics,
    [PointF[]]$Points,
    [Color]$FillColor,
    [Pen]$Pen
  )

  Draw-PolygonShape -Graphics $Graphics -Points $Points -FillColor $FillColor -Pen $Pen
  Draw-PolygonShape -Graphics $Graphics -Points (Mirror-Points $Points) -FillColor $FillColor -Pen $Pen
}

function Draw-MirroredCurve {
  param(
    [Graphics]$Graphics,
    [PointF[]]$Points,
    [Color]$FillColor,
    [Pen]$Pen,
    [float]$Tension = 0.4
  )

  Draw-Curve -Graphics $Graphics -Points $Points -FillColor $FillColor -Pen $Pen -Tension $Tension
  Draw-Curve -Graphics $Graphics -Points (Mirror-Points $Points) -FillColor $FillColor -Pen $Pen -Tension $Tension
}

function Draw-MirroredEllipse {
  param(
    [Graphics]$Graphics,
    [float]$X,
    [float]$Y,
    [float]$W,
    [float]$H,
    [Color]$FillColor,
    [Pen]$Pen
  )

  Draw-Ellipse -Graphics $Graphics -X $X -Y $Y -W $W -H $H -FillColor $FillColor -Pen $Pen
  Draw-Ellipse -Graphics $Graphics -X ($script:width - $X - $W) -Y $Y -W $W -H $H -FillColor $FillColor -Pen $Pen
}

function New-Canvas {
  $bitmap = [Bitmap]::new($width, $height, [PixelFormat]::Format32bppArgb)
  $graphics = [Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [PixelOffsetMode]::HighQuality
  $graphics.Clear([Color]::Transparent)
  return @{ Bitmap = $bitmap; Graphics = $graphics }
}

function Save-Canvas {
  param(
    [Bitmap]$Bitmap,
    [Graphics]$Graphics,
    [string]$Path
  )

  $Bitmap.Save($Path, [ImageFormat]::Png)
  $Graphics.Dispose()
  $Bitmap.Dispose()
}

$musclePen = [Pen]::new($white, 6)
$musclePen.LineJoin = [LineJoin]::Round
$musclePen.StartCap = [LineCap]::Round
$musclePen.EndCap = [LineCap]::Round

function Draw-FrontFigure {
  param([Graphics]$Graphics)

  Draw-Ellipse -Graphics $Graphics -X 132 -Y 16 -W 36 -H 46 -FillColor $skin -Pen $null
  Draw-Curve -Graphics $Graphics -Points (New-PointArray @(
    @(132, 34), @(136, 16), @(150, 9), @(164, 16), @(168, 34), @(167, 42), @(150, 34), @(133, 42)
  )) -FillColor $hair -Pen $null -Tension 0.35

  Draw-Curve -Graphics $Graphics -Points (New-PointArray @(
    @(150, 64), @(119, 72), @(101, 95), @(92, 132), @(90, 185), @(95, 250), @(104, 317), @(108, 390),
    @(108, 482), @(102, 561), @(108, 611), @(126, 628), @(150, 632)
  )) -FillColor $silhouette -Pen $null -Tension 0.33
  Draw-Curve -Graphics $Graphics -Points (Mirror-Points (New-PointArray @(
    @(150, 64), @(119, 72), @(101, 95), @(92, 132), @(90, 185), @(95, 250), @(104, 317), @(108, 390),
    @(108, 482), @(102, 561), @(108, 611), @(126, 628), @(150, 632)
  ))) -FillColor $silhouette -Pen $null -Tension 0.33

  Draw-Curve -Graphics $Graphics -Points (New-PointArray @(
    @(99, 96), @(78, 111), @(66, 143), @(62, 189), @(64, 239), @(70, 286), @(82, 286), @(92, 236), @(98, 184), @(102, 132)
  )) -FillColor $silhouette -Pen $null -Tension 0.3
  Draw-Curve -Graphics $Graphics -Points (Mirror-Points (New-PointArray @(
    @(99, 96), @(78, 111), @(66, 143), @(62, 189), @(64, 239), @(70, 286), @(82, 286), @(92, 236), @(98, 184), @(102, 132)
  ))) -FillColor $silhouette -Pen $null -Tension 0.3

  Draw-Curve -Graphics $Graphics -Points (New-PointArray @(
    @(62, 286), @(50, 292), @(42, 307), @(40, 323), @(46, 329), @(58, 328), @(66, 320), @(68, 304)
  )) -FillColor $silhouette -Pen $null -Tension 0.25
  Draw-Curve -Graphics $Graphics -Points (Mirror-Points (New-PointArray @(
    @(62, 286), @(50, 292), @(42, 307), @(40, 323), @(46, 329), @(58, 328), @(66, 320), @(68, 304)
  ))) -FillColor $silhouette -Pen $null -Tension 0.25

  Draw-Curve -Graphics $Graphics -Points (New-PointArray @(
    @(108, 612), @(100, 621), @(97, 631), @(102, 637), @(118, 636), @(127, 628), @(126, 618)
  )) -FillColor $silhouette -Pen $null -Tension 0.25
  Draw-Curve -Graphics $Graphics -Points (Mirror-Points (New-PointArray @(
    @(108, 612), @(100, 621), @(97, 631), @(102, 637), @(118, 636), @(127, 628), @(126, 618)
  ))) -FillColor $silhouette -Pen $null -Tension 0.25

  Draw-Curve -Graphics $Graphics -Points (New-PointArray @(
    @(140, 62), @(136, 76), @(141, 92), @(150, 104), @(159, 92), @(164, 76), @(160, 62), @(150, 55)
  )) -FillColor $silhouette -Pen $null -Tension 0.35

  Draw-MirroredEllipse -Graphics $Graphics -X 76 -Y 88 -W 34 -H 44 -FillColor $muscle -Pen $musclePen
  Draw-MirroredEllipse -Graphics $Graphics -X 95 -Y 86 -W 28 -H 40 -FillColor $muscle -Pen $musclePen
  Draw-MirroredPolygon -Graphics $Graphics -Points (New-PointArray @(
    @(150, 94), @(127, 94), @(111, 106), @(106, 130), @(111, 156), @(126, 170), @(150, 174)
  )) -FillColor $muscle -Pen $musclePen
  Draw-MirroredEllipse -Graphics $Graphics -X 88 -Y 147 -W 20 -H 63 -FillColor $muscle -Pen $musclePen
  Draw-MirroredPolygon -Graphics $Graphics -Points (New-PointArray @(
    @(77, 208), @(66, 235), @(69, 278), @(83, 282), @(95, 244), @(93, 212)
  )) -FillColor $muscle -Pen $musclePen
  Draw-MirroredPolygon -Graphics $Graphics -Points (New-PointArray @(
    @(123, 280), @(106, 304), @(99, 357), @(103, 430), @(116, 481), @(134, 477), @(140, 418), @(139, 334), @(134, 286)
  )) -FillColor $muscle -Pen $musclePen
  Draw-MirroredPolygon -Graphics $Graphics -Points (New-PointArray @(
    @(121, 488), @(109, 517), @(105, 570), @(110, 619), @(126, 621), @(135, 575), @(133, 522), @(130, 491)
  )) -FillColor $muscle -Pen $musclePen

  Draw-Curve -Graphics $Graphics -Points (New-PointArray @(
    @(150, 118), @(136, 126), @(129, 145), @(132, 165), @(141, 176), @(150, 179), @(159, 176), @(168, 165), @(171, 145), @(164, 126)
  )) -FillColor $muscle -Pen $musclePen -Tension 0.3
  Draw-Curve -Graphics $Graphics -Points (New-PointArray @(
    @(150, 176), @(138, 184), @(132, 202), @(134, 222), @(141, 233), @(150, 236), @(159, 233), @(166, 222), @(168, 202), @(162, 184)
  )) -FillColor $muscle -Pen $musclePen -Tension 0.3
  Draw-Curve -Graphics $Graphics -Points (New-PointArray @(
    @(150, 232), @(141, 240), @(138, 256), @(142, 269), @(150, 273), @(158, 269), @(162, 256), @(159, 240)
  )) -FillColor $muscle -Pen $musclePen -Tension 0.3

  Draw-Curve -Graphics $Graphics -Points (New-PointArray @(
    @(150, 278), @(138, 298), @(132, 340), @(136, 386), @(145, 407), @(155, 407), @(164, 386), @(168, 340), @(162, 298)
  )) -FillColor $silhouette -Pen $null -Tension 0.28
}

function Draw-BackFigure {
  param([Graphics]$Graphics)

  Draw-Ellipse -Graphics $Graphics -X 132 -Y 16 -W 36 -H 46 -FillColor $skin -Pen $null
  Draw-Curve -Graphics $Graphics -Points (New-PointArray @(
    @(132, 24), @(136, 10), @(150, 7), @(164, 10), @(168, 24), @(168, 40), @(150, 46), @(132, 40)
  )) -FillColor $hair -Pen $null -Tension 0.35

  Draw-Curve -Graphics $Graphics -Points (New-PointArray @(
    @(150, 65), @(119, 72), @(101, 96), @(92, 134), @(90, 188), @(96, 256), @(104, 322), @(108, 392),
    @(108, 486), @(103, 566), @(108, 613), @(126, 629), @(150, 633)
  )) -FillColor $silhouette -Pen $null -Tension 0.33
  Draw-Curve -Graphics $Graphics -Points (Mirror-Points (New-PointArray @(
    @(150, 65), @(119, 72), @(101, 96), @(92, 134), @(90, 188), @(96, 256), @(104, 322), @(108, 392),
    @(108, 486), @(103, 566), @(108, 613), @(126, 629), @(150, 633)
  ))) -FillColor $silhouette -Pen $null -Tension 0.33

  Draw-Curve -Graphics $Graphics -Points (New-PointArray @(
    @(99, 98), @(78, 114), @(66, 147), @(62, 194), @(64, 246), @(70, 289), @(82, 289), @(92, 239), @(98, 186), @(102, 134)
  )) -FillColor $silhouette -Pen $null -Tension 0.3
  Draw-Curve -Graphics $Graphics -Points (Mirror-Points (New-PointArray @(
    @(99, 98), @(78, 114), @(66, 147), @(62, 194), @(64, 246), @(70, 289), @(82, 289), @(92, 239), @(98, 186), @(102, 134)
  ))) -FillColor $silhouette -Pen $null -Tension 0.3

  Draw-Curve -Graphics $Graphics -Points (New-PointArray @(
    @(62, 289), @(50, 296), @(42, 311), @(40, 326), @(46, 332), @(58, 331), @(66, 323), @(68, 307)
  )) -FillColor $silhouette -Pen $null -Tension 0.25
  Draw-Curve -Graphics $Graphics -Points (Mirror-Points (New-PointArray @(
    @(62, 289), @(50, 296), @(42, 311), @(40, 326), @(46, 332), @(58, 331), @(66, 323), @(68, 307)
  ))) -FillColor $silhouette -Pen $null -Tension 0.25

  Draw-Curve -Graphics $Graphics -Points (New-PointArray @(
    @(108, 614), @(100, 623), @(97, 633), @(102, 639), @(118, 638), @(127, 630), @(126, 620)
  )) -FillColor $silhouette -Pen $null -Tension 0.25
  Draw-Curve -Graphics $Graphics -Points (Mirror-Points (New-PointArray @(
    @(108, 614), @(100, 623), @(97, 633), @(102, 639), @(118, 638), @(127, 630), @(126, 620)
  ))) -FillColor $silhouette -Pen $null -Tension 0.25

  Draw-Curve -Graphics $Graphics -Points (New-PointArray @(
    @(140, 62), @(136, 78), @(141, 95), @(150, 108), @(159, 95), @(164, 78), @(160, 62), @(150, 56)
  )) -FillColor $silhouette -Pen $null -Tension 0.35

  Draw-MirroredEllipse -Graphics $Graphics -X 76 -Y 87 -W 34 -H 42 -FillColor $muscle -Pen $musclePen
  Draw-MirroredPolygon -Graphics $Graphics -Points (New-PointArray @(
    @(128, 96), @(108, 102), @(96, 123), @(91, 165), @(95, 222), @(108, 254), @(127, 246), @(136, 194), @(136, 125)
  )) -FillColor $muscle -Pen $musclePen
  Draw-MirroredEllipse -Graphics $Graphics -X 88 -Y 147 -W 20 -H 64 -FillColor $muscle -Pen $musclePen
  Draw-MirroredPolygon -Graphics $Graphics -Points (New-PointArray @(
    @(77, 211), @(66, 239), @(69, 281), @(83, 285), @(95, 247), @(93, 214)
  )) -FillColor $muscle -Pen $musclePen
  Draw-MirroredEllipse -Graphics $Graphics -X 109 -Y 264 -W 40 -H 48 -FillColor $muscle -Pen $musclePen
  Draw-MirroredPolygon -Graphics $Graphics -Points (New-PointArray @(
    @(124, 315), @(107, 340), @(100, 396), @(103, 472), @(117, 517), @(134, 511), @(140, 448), @(139, 366), @(135, 320)
  )) -FillColor $muscle -Pen $musclePen
  Draw-MirroredPolygon -Graphics $Graphics -Points (New-PointArray @(
    @(122, 524), @(111, 550), @(107, 598), @(111, 637), @(125, 639), @(134, 603), @(133, 556), @(130, 526)
  )) -FillColor $muscle -Pen $musclePen

  Draw-PolygonShape -Graphics $Graphics -Points (New-PointArray @(
    @(150, 93), @(132, 109), @(126, 150), @(130, 212), @(138, 252), @(150, 264), @(162, 252), @(170, 212), @(174, 150), @(168, 109)
  )) -FillColor $muscle -Pen $musclePen
  Draw-Curve -Graphics $Graphics -Points (New-PointArray @(
    @(150, 230), @(140, 246), @(136, 275), @(141, 304), @(150, 314), @(159, 304), @(164, 275), @(160, 246)
  )) -FillColor $muscle -Pen $musclePen -Tension 0.3
}

$frontCanvas = New-Canvas
Draw-FrontFigure -Graphics $frontCanvas.Graphics
Save-Canvas -Bitmap $frontCanvas.Bitmap -Graphics $frontCanvas.Graphics -Path (Join-Path $outDir 'body-front-base.png')

$backCanvas = New-Canvas
Draw-BackFigure -Graphics $backCanvas.Graphics
Save-Canvas -Bitmap $backCanvas.Bitmap -Graphics $backCanvas.Graphics -Path (Join-Path $outDir 'body-back-base.png')

$musclePen.Dispose()
