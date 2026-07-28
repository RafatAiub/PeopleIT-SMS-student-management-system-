import { CreateStaffDto } from '../src/modules/hr/hr.dto';

describe('CreateStaffDto', () => {
  it('should successfully parse and transform payload without userId, basicSalary, and role designation', () => {
    const payload = {
      name: 'Tanvir Mahtab Rafat',
      role: 'IT Administrator',
      email: 'tanvirmahtab@gmail.com',
      phone: '+8801606588348',
      department: 'Science',
      joiningDate: '2026-07-28',
      basicSalary: 25000,
      allowances: 3000,
      deductions: 1000,
      status: 'Active',
    };

    const result = CreateStaffDto.parse(payload);
    expect(result).toEqual({
      name: 'Tanvir Mahtab Rafat',
      email: 'tanvirmahtab@gmail.com',
      phone: '+8801606588348',
      role: 'IT Administrator',
      designation: 'IT Administrator',
      department: 'Science',
      joiningDate: '2026-07-28',
      baseSalary: 25000,
      allowances: 3000,
      deductions: 1000,
      status: 'ACTIVE',
    });
  });

  it('should parse standard payload with userId, baseSalary, and designation', () => {
    const payload = {
      userId: 'user_12345',
      baseSalary: 30000,
      department: 'Administration',
      designation: 'Accountant',
    };

    const result = CreateStaffDto.parse(payload);
    expect(result.userId).toBe('user_12345');
    expect(result.baseSalary).toBe(30000);
    expect(result.department).toBe('Administration');
    expect(result.designation).toBe('Accountant');
  });
});
