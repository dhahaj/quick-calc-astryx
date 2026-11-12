/**
 * Built-in unit definitions, written in the same Pint-style syntax as the custom units file:
 *
 *     name = value [; offset: x] [; logbase: b; logfactor: f] = symbol = alias = alias ...
 *
 * `_` stands for "no symbol". Names, symbols and the root choices follow Pint's
 * default_en.txt so results read the same as in the original QuickCalc.
 */
export const BUILTIN_DEFINITIONS = String.raw`
# ---------------------------------------------------------------- prefixes
quecto- = 1e-30 = q-
ronto- = 1e-27 = r-
yocto- = 1e-24 = y-
zepto- = 1e-21 = z-
atto- = 1e-18 = a-
femto- = 1e-15 = f-
pico- = 1e-12 = p-
nano- = 1e-9 = n-
micro- = 1e-6 = µ- = μ- = u- = mu- = mc-
milli- = 1e-3 = m-
centi- = 1e-2 = c-
deci- = 1e-1 = d-
deca- = 1e1 = da- = deka-
hecto- = 1e2 = h-
kilo- = 1e3 = k-
mega- = 1e6 = M-
giga- = 1e9 = G-
tera- = 1e12 = T-
peta- = 1e15 = P-
exa- = 1e18 = E-
zetta- = 1e21 = Z-
yotta- = 1e24 = Y-
ronna- = 1e27 = R-
quetta- = 1e30 = Q-
kibi- = 1024 = Ki-
mebi- = 1048576 = Mi-
gibi- = 1073741824 = Gi-
tebi- = 1099511627776 = Ti-
pebi- = 1125899906842624 = Pi-
exbi- = 1152921504606846976 = Ei-

# ---------------------------------------------------------------- root units
meter = [length] = m = metre
second = [time] = s = sec
ampere = [current] = A = amp
candela = [luminosity] = cd = candle
gram = [mass] = g
mole = [substance] = mol
kelvin = [temperature] = K = degK = °K = degree_Kelvin = degreeK
radian = [] = rad
bit = []
count = []

# ---------------------------------------------------------------- angle
turn = 2 * π * radian = _ = revolution = cycle = circle = rev
degree = π / 180 * radian = deg = arcdeg = arcdegree = angular_degree
arcminute = degree / 60 = arcmin = arc_minute = angular_minute
arcsecond = arcminute / 60 = arcsec = arc_second = angular_second
gradian = π / 200 * radian = grad = gon
steradian = radian ** 2 = sr

# ---------------------------------------------------------------- length
angstrom = 1e-10 * meter = Å = ångström
micron = 1e-6 * meter = µ = μ
inch = 0.0254 * meter = in = international_inch = inches
foot = 0.3048 * meter = ft = international_foot = feet
yard = 0.9144 * meter = yd = international_yard
mile = 1609.344 * meter = mi = international_mile
thou = 2.54e-5 * meter = th = mil_length
hand = 0.1016 * meter
fathom = 1.8288 * meter
rod = 5.0292 * meter = rd = pole = perch
chain = 20.1168 * meter
furlong = 201.168 * meter
league = 4828.032 * meter
nautical_mile = 1852 * meter = nmi
astronomical_unit = 149597870700 * meter = au
light_year = 9460730472580800 * meter = ly = lightyear
parsec = 3.0856775814913673e16 * meter = pc

# ---------------------------------------------------------------- area and volume
are = 100 * meter ** 2
hectare = 100 * are = ha
acre = 4046.8564224 * meter ** 2 = _ = international_acre
barn = 1e-28 * meter ** 2
liter = 1e-3 * meter ** 3 = L = l = litre
cubic_centimeter = 1e-6 * meter ** 3 = cc
gallon = 3.785411784e-3 * meter ** 3 = gal = liquid_gallon = US_liquid_gallon
quart = gallon / 4 = qt = liquid_quart = US_liquid_quart
pint = gallon / 8 = pt = liquid_pint = US_pint
cup = gallon / 16 = _ = liquid_cup = US_liquid_cup
fluid_ounce = gallon / 128 = floz = US_fluid_ounce = US_liquid_ounce
tablespoon = gallon / 256 = tbsp = Tbsp = tblsp = tbs
teaspoon = gallon / 768 = tsp
oil_barrel = 42 * gallon = bbl

# ---------------------------------------------------------------- mass
pound = 0.45359237 * kilogram = lb = avoirdupois_pound
ounce = pound / 16 = oz = avoirdupois_ounce
grain = pound / 7000 = gr
stone = 14 * pound
ton = 2000 * pound = _ = short_ton
long_ton = 2240 * pound
tonne = 1000 * kilogram = t = metric_ton
carat = 0.2 * gram = ct = karat
dalton = 1.66053906660e-27 * kilogram = Da

# ---------------------------------------------------------------- time
minute = 60 * second = min
hour = 60 * minute = h = hr
day = 24 * hour = d
week = 7 * day
fortnight = 2 * week
year = 365.25 * day = a = yr = julian_year
month = year / 12

# ---------------------------------------------------------------- rates and speed
hertz = 1 / second = Hz
becquerel = 1 / second = Bq
revolutions_per_minute = turn / minute = rpm = rev_per_min = RPM
mile_per_hour = mile / hour = mph = MPH
kilometer_per_hour = kilometer / hour = kph = KPH
knot = nautical_mile / hour = kt = knot_international = international_knot
speed_of_light = 299792458 * meter / second = c = c_0

# ---------------------------------------------------------------- mechanics
newton = kilogram * meter / second ** 2 = N
dyne = gram * centimeter / second ** 2 = dyn
force_pound = 4.4482216152605 * newton = lbf = pound_force
force_kilogram = 9.80665 * newton = kgf = kilogram_force = pond
kip = 1000 * force_pound
joule = newton * meter = J
erg = dyne * centimeter
watt = joule / second = W
watt_hour = watt * hour = Wh = watthour
calorie = 4.184 * joule = cal = thermochemical_calorie = cal_th
british_thermal_unit = 1055.056 * joule = Btu = BTU = EnergyBTU
therm = 1e5 * british_thermal_unit = thm = EC_therm
electron_volt = 1.602176634e-19 * joule = eV
horsepower = 550 * foot * force_pound / second = hp = UK_horsepower = hydraulic_horsepower
pascal = newton / meter ** 2 = Pa
bar = 1e5 * pascal
atmosphere = 101325 * pascal = atm = standard_atmosphere
torr = atmosphere / 760 = Torr
pound_force_per_square_inch = force_pound / inch ** 2 = psi
millimeter_Hg = 133.322387415 * pascal = mmHg = mm_Hg
inch_Hg = 3386.388640341 * pascal = inHg

# ---------------------------------------------------------------- logarithmic power
decibelwatt = watt; logbase: 10; logfactor: 10 = dBW
decibelmilliwatt = 1e-3 * watt; logbase: 10; logfactor: 10 = dBm
decibel = 1; logbase: 10; logfactor: 10 = dB

# ---------------------------------------------------------------- electromagnetism
coulomb = ampere * second = C
volt = joule / coulomb = V
farad = coulomb / volt = F
ohm = volt / ampere = Ω
siemens = ampere / volt = S = mho
weber = volt * second = Wb
tesla = weber / meter ** 2 = T
henry = weber / ampere = H
gauss = 1e-4 * tesla = G
ampere_hour = ampere * hour = Ah

# ---------------------------------------------------------------- temperature
degree_Celsius = kelvin; offset: 273.15 = °C = celsius = degC = degreeC
degree_Fahrenheit = 5 / 9 * kelvin; offset: 233.15 + 200 / 9 = °F = fahrenheit = degF = degreeF
degree_Rankine = 5 / 9 * kelvin = °R = rankine = degR = degreeR

# ---------------------------------------------------------------- information
byte = 8 * bit = B = octet

# ---------------------------------------------------------------- light, radiation, chemistry
lumen = candela * steradian = lm
lux = lumen / meter ** 2 = lx
gray = joule / kilogram = Gy
sievert = joule / kilogram = Sv
katal = mole / second = kat
molar = mole / liter = M
ppm = 1e-6
`;
