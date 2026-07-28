import { CreateRouteDto } from '../src/modules/transport/transport.dto';

describe('CreateRouteDto', () => {
  it('should successfully parse and transform payload with stops as number', () => {
    const payload = {
      name: 'rampura to quril',
      startPoint: 'rampura ',
      endPoint: 'quril',
      distance: '10',
      vehicleId: '561351531',
      stops: 6,
    };

    const result = CreateRouteDto.parse(payload);
    expect(result).toEqual({
      name: 'rampura to quril',
      stops: '6',
      routeFare: 0,
      isActive: true,
    });
  });

  it('should successfully parse payload with startPoint and endPoint when stops is omitted', () => {
    const payload = {
      name: 'Motijheel to Gulshan Express',
      startPoint: 'Motijheel',
      endPoint: 'Gulshan',
      routeFare: '150',
    };

    const result = CreateRouteDto.parse(payload);
    expect(result).toEqual({
      name: 'Motijheel to Gulshan Express',
      stops: 'Motijheel -> Gulshan',
      routeFare: 150,
      isActive: true,
    });
  });

  it('should successfully parse payload with stops as an array of strings', () => {
    const payload = {
      name: 'City Loop Route',
      stops: ['Dhanmondi', 'Mirpur', 'Uttara'],
      routeFare: 80,
    };

    const result = CreateRouteDto.parse(payload);
    expect(result).toEqual({
      name: 'City Loop Route',
      stops: 'Dhanmondi, Mirpur, Uttara',
      routeFare: 80,
      isActive: true,
    });
  });

  it('should successfully parse standard payload with string stops and number fare', () => {
    const payload = {
      name: 'Standard Route A',
      stops: 'Stop 1, Stop 2, Stop 3',
      routeFare: 120,
    };

    const result = CreateRouteDto.parse(payload);
    expect(result).toEqual({
      name: 'Standard Route A',
      stops: 'Stop 1, Stop 2, Stop 3',
      routeFare: 120,
      isActive: true,
    });
  });
});
